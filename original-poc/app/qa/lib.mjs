/**
 * QA スクリプトの共通部分。`vite preview`（ポート 5180）が動いていなければ起動し、
 * インストール済みの Chrome（CHROME_CHANNEL で変更可）をヘッドレスで開く。
 */
import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

export const APP_DIR = fileURLToPath(new URL("..", import.meta.url));
export const OUT_DIR = fileURLToPath(new URL("./out/", import.meta.url));
export const URL_BASE = process.env.EDITOR_URL ?? "http://localhost:5180/";

async function isUp(url) {
  try {
    return (await fetch(url)).ok;
  } catch {
    return false;
  }
}

/** プレビューのサーバーを用意する。止める関数を返す（自分で起動したときだけ止める）。 */
export async function ensurePreview() {
  if (await isUp(URL_BASE)) return () => {};
  const child = spawn("pnpm", ["exec", "vite", "preview", "--port", "5180", "--strictPort"], {
    cwd: APP_DIR,
    stdio: "ignore",
  });
  for (let i = 0; i < 50; i++) {
    if (await isUp(URL_BASE)) return () => child.kill();
    await new Promise((r) => setTimeout(r, 200));
  }
  child.kill();
  throw new Error(`${URL_BASE} が起動しません（先に pnpm --filter @ui-editor/poc-app build）`);
}

/** ブラウザを開き、ページのエラーを集める。File System Access API は消してダウンロードの経路を使う。 */
export async function openEditor() {
  mkdirSync(OUT_DIR, { recursive: true });
  const browser = await chromium.launch({
    channel: process.env.CHROME_CHANNEL ?? "chrome",
    headless: process.env.HEADED !== "1",
  });
  const context = await browser.newContext({
    viewport: { width: 1400, height: 900 },
    acceptDownloads: true,
  });
  const page = await context.newPage();
  await page.addInitScript("delete window.showSaveFilePicker; delete window.showOpenFilePicker;");
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  await page.goto(URL_BASE);
  await page.evaluate("localStorage.clear()");
  await page.reload();
  return { browser, page, errors };
}

/** 確認項目を記録する。 */
export function checklist() {
  const items = [];
  return {
    items,
    check(name, ok, detail = "") {
      items.push({ name, ok: Boolean(ok), detail: String(detail) });
      console.log(`${ok ? "OK  " : "NG  "} ${name}${detail ? ` — ${detail}` : ""}`);
    },
    get failed() {
      return items.filter((i) => !i.ok);
    },
  };
}

/** パネルの入力欄に入れて確定する（フォーカスを外す）。 */
export async function commit(page, label, value) {
  const input = page.getByLabel(label, { exact: true });
  await input.fill(value);
  await input.press("Enter");
}

/** 題材の 3 画面・2 ダイアログ（ステップ 1・2 の QA で使う）。 */
export const DEVICE_CONTAINERS = [
  { kind: "画面", id: "dashboard", name: "ダッシュボード" },
  { kind: "画面", id: "devices", name: "機器一覧" },
  { kind: "画面", id: "deviceDetail", name: "機器詳細" },
  { kind: "ダイアログ", id: "deviceEdit", name: "機器の編集" },
  { kind: "ダイアログ", id: "deviceDelete", name: "削除の確認" },
];

/** 題材の遷移 7 本。 */
export const DEVICE_TRANSITIONS = [
  ["dashboard", "devices"],
  ["devices", "deviceEdit"],
  ["devices", "dashboard"],
  ["devices", "deviceDetail"],
  ["deviceDetail", "deviceDelete"],
  ["deviceDetail", "devices"],
  ["deviceDelete", "devices"],
];

/** フロー図で、ノードの右の点から別のノードの左の点へドラッグする。 */
export async function dragConnect(page, from, to) {
  const a = await page
    .locator(`.react-flow__node[data-id=${from}] .react-flow__handle-right`)
    .boundingBox();
  const b = await page
    .locator(`.react-flow__node[data-id=${to}] .react-flow__handle-left`)
    .boundingBox();
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move((a.x + b.x) / 2, (a.y + b.y) / 2 + 40, { steps: 8 });
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 6 });
  await page.mouse.up();
}

/**
 * 空のプロジェクトから、フロービューで題材の画面・ダイアログと遷移（仮のボタン）を作る。
 * 人が行う操作の数を返す。
 */
export async function buildDeviceFlow(page, { fresh = true } = {}) {
  let ops = 0;
  if (fresh) {
    await page.getByRole("button", { name: "新規", exact: true }).click();
    ops++;
  }
  await page
    .getByRole("navigation", { name: "ビュー" })
    .getByRole("button", { name: "フロー" })
    .click();
  ops++;
  for (const c of DEVICE_CONTAINERS) {
    await page.getByRole("button", { name: `＋ ${c.kind}` }).click();
    await commit(page, `${c.kind}の名前`, c.name);
    await commit(page, `${c.kind}の id`, c.id);
    ops += 3;
  }
  await page.getByRole("button", { name: "整列" }).click();
  ops++;
  await page.waitForTimeout(400);
  for (const [from, to] of DEVICE_TRANSITIONS) {
    await dragConnect(page, from, to);
    await page.waitForTimeout(80);
    ops++;
  }
  await page.getByRole("button", { name: "整列" }).click();
  ops++;
  await page.waitForTimeout(400);
  return ops;
}

/** 選択肢の文言が prefix で始まるものを選ぶ（値が分からないとき）。 */
export async function selectByText(select, prefix) {
  const value = await select.evaluate(
    (el, p) => [...el.options].find((o) => o.textContent.startsWith(p))?.value,
    prefix,
  );
  if (value === undefined) throw new Error(`「${prefix}」の選択肢がありません`);
  await select.selectOption(value);
}
