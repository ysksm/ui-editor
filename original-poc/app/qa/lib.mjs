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
