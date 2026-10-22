/**
 * ステップ 6 の完了条件の QA（#138）:
 * - 生成された機器詳細画面にボタンを足して新しい遷移に結びつけ、書き出したコードがプレビューと同じように動く
 * - 生成したコードが tsc を通り、プレビューと同じ QA の筋書きが生成アプリでも通る
 *
 * 新規 → ER（機器・アラーム）とサンプルデータ → 「画面を生成」→ フロー図で機器詳細 → アラーム一覧の線を引く（仮のボタン）
 * → 画面ビューで部品を足す・並べ替える・消す、文言にバインディング（候補の補完）、足したボタンに仮の部品の遷移を移す
 * → 「コードを書き出す」（zip）→ 展開してワークスペースの外のアプリとしてインストールし `tsc && vite build`
 * → 同じ筋書き（一覧 → 編集と検証 → 詳細 → 足したボタンで遷移 → 戻る → 子の追加 → 削除）をプレビューと生成アプリ
 *   （vite preview、ポート 5181）で流し、見えたものを比べる。
 *
 *   pnpm --filter "./original-poc/**" build
 *   pnpm --filter @ui-editor/poc-app qa:step6
 */
import { execFileSync, spawn } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import {
  addRelationFromPanel,
  checklist,
  commit,
  createEntity,
  dragConnect,
  ensurePreview,
  openEditor,
  OUT_DIR,
  selectEntity,
} from "./lib.mjs";

const APP_URL = "http://localhost:5181/";
const stop = await ensurePreview();
const { browser, page: p, errors } = await openEditor();
const qa = checklist();
const started = Date.now();
const nav = (name) => p.getByRole("navigation", { name: "ビュー" }).getByRole("button", { name });
const badge = async () => (await p.getByRole("button", { name: /^検証:/ }).innerText()).trim();
const outline = () => p.getByRole("region", { name: "中身" });
const panel = () => p.getByRole("region", { name: "部品の編集" });
const sample = () => p.getByRole("region", { name: "この画面のプレビュー" });
const ids = async () => outline().locator(".outline-id").allInnerTexts();
let stopApp = () => {};

/** 部品を足し、パネルに出た id を返す。 */
async function addNode(type) {
  await outline().getByLabel("部品を追加").selectOption(type);
  return panel().getByLabel("部品の id").inputValue();
}

/**
 * プレビューと生成アプリで同じ筋書きを流し、見えたもの（件数・文言）を記録する。
 * d: { start, screen(name), dialog(name), back }
 */
async function scenario(d) {
  const seen = [];
  const record = (name, value) => seen.push([name, value]);
  await d.start();
  const list = d.screen("機器一覧");
  await list.getByRole("heading", { name: "機器一覧" }).waitFor();
  record("一覧の行数", await list.locator("tbody tr").count());
  // 選んで編集（必須の検証 → 直して保存）
  await list.locator("tbody tr").first().getByRole("radio").check();
  await list.getByRole("button", { name: "編集" }).click();
  const form = d.dialog("機器の編集");
  await form.getByLabel(/^名前/).fill("");
  await form.getByRole("button", { name: "保存" }).click();
  await form.getByText("必須の項目です").waitFor();
  record("名前を空にして保存すると", "必須の項目です");
  await form.getByLabel(/^名前/).fill("QA で編集した機器");
  await form.getByRole("button", { name: "保存" }).click();
  await form.waitFor({ state: "detached" });
  record("保存すると一覧に出る", await list.getByText("QA で編集した機器").isVisible());
  // 詳細
  await list.getByText("QA で編集した機器").click();
  const detail = d.screen("機器詳細");
  await detail.getByRole("heading", { name: "QA で編集した機器" }).waitFor();
  record("詳細のアラームの表の行", await detail.locator("tbody tr").count());
  record("詳細の件数（バインディング）", await detail.getByText(/^アラーム件数:/).innerText());
  // 足したボタン → アラーム一覧 → 戻る
  await detail.getByRole("button", { name: "全アラームを見る" }).click();
  const alarms = d.screen("アラーム一覧");
  await alarms.getByRole("heading", { name: "アラーム一覧" }).waitFor();
  record("足したボタンで移った先", "アラーム一覧");
  record("アラーム一覧の行数", await alarms.locator("tbody tr").count());
  await d.back();
  await detail.getByRole("heading", { name: "QA で編集した機器" }).waitFor();
  record("戻ると", "機器詳細");
  // 子（アラーム）の追加
  await detail.getByRole("button", { name: "アラームを追加" }).click();
  const alarmForm = d.dialog("アラームの編集");
  await alarmForm.getByLabel(/^レベル/).selectOption("error");
  await alarmForm.getByLabel(/^内容/).fill("QA のアラーム");
  await alarmForm.getByRole("button", { name: "保存" }).click();
  await alarmForm.waitFor({ state: "detached" });
  record("追加すると詳細に出る", await detail.getByText("QA のアラーム").isVisible());
  record("追加後の件数（バインディング）", await detail.getByText(/^アラーム件数:/).innerText());
  // 削除（入れ子のアラームごと）
  await detail.getByRole("button", { name: "削除" }).click();
  const confirm = d.dialog("機器の削除");
  record("削除の確認", (await confirm.getByText(/を削除しますか？/).innerText()).trim());
  await confirm.getByRole("button", { name: "削除する" }).click();
  await list.getByRole("heading", { name: "機器一覧" }).waitFor();
  record("削除後の一覧の行数", await list.locator("tbody tr").count());
  record("削除した機器は一覧に無い", !(await list.getByText("QA で編集した機器").isVisible()));
  return seen;
}

try {
  // ---- ER・サンプルデータ・生成（ステップ 5 と同じ） ----
  await p.getByRole("button", { name: "新規", exact: true }).click();
  await commit(p, "プロジェクト名", "QA ステップ 6");
  await nav("ER").click();
  await createEntity(p, {
    id: "Device",
    name: "機器",
    fields: [
      { id: "name", name: "名前", type: "string", required: true },
      { id: "status", name: "状態", type: "enum", values: "online, offline" },
    ],
  });
  await p.getByLabel("表示用フィールド").selectOption("name");
  await createEntity(p, {
    id: "Alarm",
    name: "アラーム",
    fields: [
      { id: "level", name: "レベル", type: "enum", values: "info, warn, error", required: true },
      { id: "message", name: "内容", type: "string", required: true },
    ],
  });
  await p.getByLabel("表示用フィールド").selectOption("message");
  await p.getByRole("button", { name: "整列" }).click();
  await selectEntity(p, "Device");
  await addRelationFromPanel(p, "1 対多（入れ子）", "Alarm");
  await nav("データ").click();
  await p.getByRole("button", { name: "サンプルデータを生成…" }).click();
  const seed = p.getByRole("dialog", { name: "サンプルデータの生成" });
  await seed.getByLabel("機器の件数").fill("5");
  await seed.getByLabel("アラームの件数").fill("12");
  await seed.getByRole("button", { name: "生成して置き換える" }).click();
  await nav("ER").click();
  for (const id of ["Device", "Alarm"]) {
    await selectEntity(p, id);
    await p.getByRole("button", { name: "画面を生成（一覧・詳細・編集・削除）" }).click();
  }
  qa.check(
    "ER から機器・アラームの画面を生成（検証の問題 0 件）",
    (await badge()) === "エラー 0・警告 0",
  );

  // ---- フロー図で新しい遷移（仮のボタン）----
  await nav("フロー").click();
  await p.getByRole("button", { name: "整列" }).click();
  await p.waitForTimeout(400);
  await dragConnect(p, "deviceDetail", "alarms");
  await p.waitForTimeout(200);
  qa.check(
    "フロー図で機器詳細 → アラーム一覧の線を引くと、仮のボタンの警告が出る",
    (await badge()) === "エラー 0・警告 1",
    await badge(),
  );

  // ---- 画面ビュー: 部品の追加・並べ替え・削除（FR-UI-01）----
  await nav("画面").click();
  await p
    .getByRole("navigation", { name: "画面とダイアログ" })
    .getByRole("button", { name: /機器詳細/ })
    .click();
  await outline().getByText("toolbar", { exact: true }).click();
  const button = await addNode("Button");
  await commit(p, `文言（${button}）`, "全アラームを見る");
  const before = await ids();
  await panel().getByRole("button", { name: "部品を上へ" }).click();
  const after = await ids();
  qa.check(
    "部品を足して並べ替えられる（↑ で 1 つ前へ）",
    after.indexOf(button) === before.indexOf(button) - 1 &&
      (await sample().getByRole("button", { name: "全アラームを見る" }).isVisible()),
    `${before.join(",")} → ${after.join(",")}`,
  );
  await outline().getByText("page", { exact: true }).click();
  const temp = await addNode("Text");
  await panel().getByRole("button", { name: "部品を削除" }).click();
  qa.check("部品を消せる", !(await ids()).includes(temp));

  // ---- バインディング（候補の補完。FR-UI-02）----
  await outline().getByText("page", { exact: true }).click();
  const count = await addNode("Text");
  const input = panel().getByLabel(`文言（${count}）`, { exact: true });
  const listId = await input.getAttribute("list");
  const candidates = await p
    .locator(`datalist[id="${listId}"] option`)
    .evaluateAll((os) => os.map((o) => o.getAttribute("value")));
  qa.check(
    "文言の欄に、この画面で使える名前の候補が出る",
    candidates.includes("{{ record?.alarms ?? [] }}") && candidates.includes("{{ record?.name }}"),
    `${candidates.length} 件: ${candidates.slice(0, 6).join(" ")}`,
  );
  await commit(p, `文言（${count}）`, "アラーム件数: {{ (record?.alarms ?? []).length }}");
  qa.check(
    "バインドした文言がこの画面のプレビューに出る",
    /^アラーム件数: \d+$/.test(
      await sample()
        .getByText(/^アラーム件数:/)
        .innerText(),
    ),
    await sample()
      .getByText(/^アラーム件数:/)
      .innerText(),
  );

  // ---- 足したボタンに仮の部品の遷移を移す（FR-UI-03）----
  await outline().getByText(button, { exact: true }).click();
  const placeholders = panel().getByRole("list", { name: "仮の部品の遷移" });
  qa.check(
    "仮の部品のままの遷移が一覧に出る",
    (await placeholders.innerText()).includes("アラーム一覧"),
  );
  await placeholders.getByRole("button", { name: "この部品に移す" }).click();
  qa.check(
    "足したボタンに遷移を移すと、仮のボタンは消え、警告も消える",
    (await badge()) === "エラー 0・警告 0" &&
      (await panel().getByRole("list", { name: "この部品の遷移" }).innerText()).includes(
        "アラーム一覧",
      ),
    await badge(),
  );
  await p.screenshot({ path: `${OUT_DIR}step6-screen.png` });

  // ---- プレビューで同じ筋書き ----
  await p.getByRole("button", { name: "▶ プレビュー" }).click();
  const pane = () => p.getByRole("complementary", { name: "プレビュー" });
  const previewSeen = await scenario({
    start: () => pane().getByRole("button", { name: "最初から" }).click(),
    screen: (name) => pane().getByRole("region", { name: `画面: ${name}`, exact: true }),
    dialog: (name) => pane().getByRole("dialog", { name }),
    back: () => pane().getByRole("button", { name: "戻る" }).click(),
  });
  qa.check(
    "プレビューで筋書きが最後まで動く",
    previewSeen.length === 13,
    JSON.stringify(previewSeen),
  );
  await p.screenshot({ path: `${OUT_DIR}step6-preview.png` });

  // ---- コードを書き出す（zip）→ インストール・tsc・ビルド ----
  const [download] = await Promise.all([
    p.waitForEvent("download"),
    p.getByRole("button", { name: "コードを書き出す" }).click(),
  ]);
  const zipPath = `${OUT_DIR}step6.zip`;
  await download.saveAs(zipPath);
  const appName = download.suggestedFilename().replace(/\.zip$/, "");
  const root = `${OUT_DIR}step6-app/`;
  const appDir = `${root}${appName}/`;
  rmSync(`${appDir}src`, { recursive: true, force: true });
  mkdirSync(root, { recursive: true });
  execFileSync("unzip", ["-o", "-q", zipPath, "-d", root]);
  const detailSource = readFileSync(`${appDir}src/screens/DeviceDetailScreen.tsx`, "utf8");
  qa.check(
    "書き出したコードに、足したボタン・遷移・バインディングがある",
    detailSource.includes('label="全アラームを見る"') &&
      detailSource.includes('navigate("alarms")') &&
      detailSource.includes("(record?.alarms ?? []).length"),
  );
  const run = (...args) =>
    execFileSync("pnpm", args, { cwd: appDir, encoding: "utf8", stdio: "pipe" });
  run("install", "--ignore-workspace", "--reporter=silent");
  let built = "";
  try {
    built = run("run", "build");
    qa.check("書き出したコードが tsc（strict）と vite build を通る", /built in/.test(built));
  } catch (e) {
    qa.check(
      "書き出したコードが tsc（strict）と vite build を通る",
      false,
      `${e.stdout ?? ""}${e.stderr ?? ""}`,
    );
    throw e;
  }

  // ---- 生成アプリで同じ筋書き ----
  const server = spawn("pnpm", ["exec", "vite", "preview", "--port", "5181", "--strictPort"], {
    cwd: appDir,
    stdio: "ignore",
  });
  stopApp = () => server.kill();
  for (let i = 0; i < 50; i++) {
    if (
      await fetch(APP_URL)
        .then((r) => r.ok)
        .catch(() => false)
    )
      break;
    await new Promise((r) => setTimeout(r, 200));
  }
  const app = await browser.newPage({ viewport: { width: 1200, height: 800 } });
  const appErrors = [];
  app.on("pageerror", (e) => appErrors.push(e.message));
  app.on("console", (m) => m.type() === "error" && appErrors.push(m.text()));
  const appSeen = await scenario({
    start: () => app.goto(APP_URL),
    screen: () => app.locator("main"),
    dialog: (name) => app.getByRole("dialog", { name }),
    back: () => app.goBack(),
  });
  await app.screenshot({ path: `${OUT_DIR}step6-app.png` });
  const diff = previewSeen.filter((x, i) => JSON.stringify(x) !== JSON.stringify(appSeen[i]));
  qa.check(
    "生成アプリでも同じ筋書きが最後まで動き、見えたものがプレビューと同じ",
    appSeen.length === previewSeen.length && diff.length === 0,
    diff.length
      ? `違い: ${JSON.stringify(diff)} / 生成アプリ: ${JSON.stringify(appSeen)}`
      : `${appSeen.length} 項目`,
  );
  qa.check("生成アプリのページのエラーが無い", appErrors.length === 0, appErrors.join("\n"));
  qa.check("エディタのページのエラーが無い", errors.length === 0, errors.join("\n"));
  writeFileSync(
    `${OUT_DIR}step6-seen.json`,
    `${JSON.stringify({ preview: previewSeen, app: appSeen }, null, 2)}\n`,
  );
} catch (e) {
  qa.check("例外なく最後まで動く", false, e.stack ?? e);
  await p.screenshot({ path: `${OUT_DIR}step6-error.png` }).catch(() => {});
} finally {
  const seconds = Math.round((Date.now() - started) / 1000);
  writeFileSync(
    `${OUT_DIR}step6.json`,
    `${JSON.stringify({ seconds, items: qa.items }, null, 2)}\n`,
  );
  console.log(`\n${qa.items.length - qa.failed.length}/${qa.items.length} OK（${seconds} 秒）`);
  await browser.close();
  stopApp();
  stop();
}
process.exit(qa.failed.length === 0 ? 0 : 1);
