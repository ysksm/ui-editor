/**
 * ステップ 4 の完了条件の QA（#119）:
 * 「機器を選んで編集・保存すると一覧に反映される。機器を削除すると、その機器のアラームも消える（cascade）」
 *
 * 手書きの中身が無いプロジェクト（題材の ER とデータだけ）を開き、画面の操作だけで
 * 1. フロー図で 3 画面・2 ダイアログと遷移（仮のボタン）を作る
 * 2. 画面ビューで役割とエンティティを設定してテンプレートを当てる
 * 3. 遷移パネルでトリガー（行クリック・選択＋ボタン・確認の OK）と渡す値を結ぶ
 * 4. プレビューで編集・保存とカスケード削除を確かめる
 *
 *   pnpm --filter "./original-poc/**" build
 *   pnpm --filter @ui-editor/poc-app qa:step4
 */
import { readFileSync, writeFileSync } from "node:fs";
import { formatIssue, loadProject } from "@ui-editor/poc-model";
import {
  buildDeviceFlow,
  checklist,
  commit,
  ensurePreview,
  openEditor,
  OUT_DIR,
  selectByText,
} from "./lib.mjs";

// 題材から画面・ダイアログを外した「ER とデータだけ」のファイルを用意する
const example = JSON.parse(
  readFileSync(new URL("../../examples/device-monitor.poc.json", import.meta.url), "utf8"),
);
const erOnly = { ...example, name: "QA ステップ 4", screens: [], dialogs: [] };
delete erOnly.entry;
delete erOnly.layout;
const erOnlyPath = `${OUT_DIR}step4-er-only.poc.json`;

const stop = await ensurePreview();
const { browser, page: p, errors } = await openEditor();
writeFileSync(erOnlyPath, `${JSON.stringify(erOnly, null, 2)}\n`);
const qa = checklist();
const started = Date.now();
const nav = (name) => p.getByRole("navigation", { name: "ビュー" }).getByRole("button", { name });
const pane = () => p.getByRole("complementary", { name: "プレビュー" });
const frame = (name) => pane().getByRole("region", { name, exact: true });
const visible = (locator) =>
  locator
    .first()
    .waitFor({ state: "visible", timeout: 2000 })
    .then(() => true)
    .catch(() => false);

/** フロー図で遷移を選ぶ（遷移元のノード → パネルの「出ていく遷移」）。 */
async function selectTransition(from, toName) {
  await nav("フロー").click();
  await p.locator(`.react-flow__node[data-id="${from}"]`).click();
  await p
    .getByRole("list", { name: "出ていく遷移" })
    .getByRole("button", { name: new RegExp(`^→ ${toName}`) })
    .click();
}

try {
  // ---- ER とデータだけのファイルを開く ----
  const [chooser] = await Promise.all([
    p.waitForEvent("filechooser"),
    p.getByRole("button", { name: "開く", exact: true }).click(),
  ]);
  await chooser.setFiles(erOnlyPath);
  // 読み込みは非同期なので、名前が入るまで待つ
  await p
    .waitForFunction(
      () => document.querySelector('[aria-label="プロジェクト名"]')?.value === "QA ステップ 4",
      undefined,
      { timeout: 3000 },
    )
    .catch(() => {});
  qa.check(
    "ER とデータだけのプロジェクトを開ける",
    (await p.getByLabel("プロジェクト名").inputValue()) === "QA ステップ 4",
  );

  // ---- 1. フロー: 3 画面・2 ダイアログと遷移（仮のボタン）----
  await buildDeviceFlow(p, { fresh: false });

  // ---- 2. 画面ビュー: 役割とエンティティ ----
  await nav("画面").click();
  for (const [name, kind] of [
    ["機器一覧", "list"],
    ["機器詳細", "detail"],
    ["機器の編集", "form"],
    ["削除の確認", "confirm"],
  ]) {
    await p
      .getByRole("navigation", { name: "画面とダイアログ" })
      .getByRole("button", { name: new RegExp(name) })
      .click();
    const settings = p.getByRole("region", { name: "役割とエンティティ" });
    await settings.getByLabel("役割").selectOption(kind);
    await settings.getByLabel("エンティティ").selectOption("Device");
    await settings.getByRole("button", { name: "テンプレートを適用" }).click();
  }
  await p
    .getByRole("navigation", { name: "画面とダイアログ" })
    .getByRole("button", { name: /機器詳細/ })
    .click();
  await p.screenshot({ path: `${OUT_DIR}step4-screen.png` });

  // ---- 3. 遷移パネル: トリガーと渡す値 ----
  const panel = () => p.getByRole("complementary", { name: "遷移の編集" });
  await selectTransition("devices", "機器詳細");
  await panel().getByLabel("行クリック（T2）").check();
  await panel().getByLabel("トリガーの表").selectOption("table");
  await panel().getByRole("button", { name: "トリガーを変更" }).click();

  await selectTransition("devices", "機器の編集");
  await panel().getByLabel("選択＋ボタン（T3）").check();
  await panel().getByLabel("トリガーの表").selectOption("table");
  await panel().getByLabel("トリガーのエンティティ").selectOption("Device");
  await selectByText(panel().getByLabel("トリガーのボタン"), "機器の編集を開く");
  await panel().getByRole("button", { name: "トリガーを変更" }).click();

  await selectTransition("deviceDetail", "削除の確認");
  await commit(p, "渡す値 deviceId", "{{ params.deviceId }}");

  await selectTransition("deviceDelete", "機器一覧");
  await panel().getByLabel("ボタン（T1）").check();
  await panel().getByLabel("トリガーのボタン").selectOption("ok");
  await panel().getByRole("button", { name: "トリガーを変更" }).click();

  const badge = await p.getByRole("button", { name: /^検証:/ }).innerText();
  qa.check("組み立て後、検証のエラーが 0 件", /^エラー 0/.test(badge.trim()), badge);

  // ---- 4. プレビュー ----
  await p.getByRole("button", { name: "▶ プレビュー" }).click();
  await frame("画面: ダッシュボード").getByRole("button", { name: "機器一覧へ" }).click();
  const list = () => frame("画面: 機器一覧");
  const editButton = () => list().getByRole("button", { name: "機器の編集を開く" });
  qa.check("選択＋ボタン: 未選択なら編集は押せない", await editButton().isDisabled());
  await list().getByLabel("dev-003 を選ぶ").check();
  await editButton().click();
  const form = pane().getByRole("dialog", { name: "機器の編集" });
  qa.check(
    "選んだ機器の編集フォーム（下書き）",
    (await form.getByLabel(/^名前/).inputValue()) === "エッジルーター 1F",
  );
  await form.getByLabel(/^名前/).fill("");
  await form.getByRole("button", { name: "保存" }).click();
  qa.check(
    "必須の項目が空なら保存せず、項目の横にエラー",
    await visible(form.getByText("必須の項目です")),
  );
  await form.getByLabel(/^名前/).fill("エッジルーター 改");
  await form.getByRole("button", { name: "保存" }).click();
  qa.check(
    "完了条件 1: 機器を選んで編集・保存すると一覧に反映される",
    (await visible(list().getByText("エッジルーター 改"))) && !(await form.isVisible()),
  );
  await p.screenshot({ path: `${OUT_DIR}step4-edited.png` });

  await list().getByText("コアスイッチ A").click();
  qa.check(
    "行クリックで詳細（テンプレート）",
    await visible(frame("画面: 機器詳細").getByRole("heading", { name: "コアスイッチ A" })),
  );
  qa.check(
    "詳細に入れ子のアラームの表",
    await visible(frame("画面: 機器詳細").getByText("ポート 24 のリンクがダウンしました")),
  );
  await frame("画面: 機器詳細").getByRole("button", { name: "削除の確認を開く" }).click();
  const confirm = pane().getByRole("dialog", { name: "削除の確認" });
  qa.check(
    "確認ダイアログに機器名",
    await visible(confirm.getByText(/「コアスイッチ A」を削除しますか？/)),
  );
  await confirm.getByRole("button", { name: "削除する" }).click();
  qa.check(
    "削除すると一覧に戻り、機器が消える",
    (await visible(list())) && !(await list().getByText("コアスイッチ A").isVisible()),
  );
  await pane().getByRole("button", { name: /ログ/ }).click();
  const log = await pane().getByRole("list", { name: "ログ" }).innerText();
  qa.check(
    "完了条件 2: 機器を削除すると、その機器のアラームも消える（cascade）",
    log.includes("機器 dev-001 を削除（機器設定 1 件、メトリクス 3 件、アラーム 2 件も）"),
    log.split("\n").find((l) => l.includes("削除（")) ?? "",
  );
  await p.screenshot({ path: `${OUT_DIR}step4-deleted.png` });

  // ---- 保存したファイル ----
  const [download] = await Promise.all([
    p.waitForEvent("download"),
    p.getByRole("button", { name: "保存", exact: true }).click(),
  ]);
  const savedPath = `${OUT_DIR}step4.poc.json`;
  await download.saveAs(savedPath);
  const loaded = loadProject(readFileSync(savedPath, "utf8"));
  qa.check(
    "保存したファイル: エラー 0 件",
    loaded.success && loaded.issues.every((i) => i.severity !== "error"),
    loaded.success ? loaded.issues.map(formatIssue).join("\n") : "",
  );
  qa.check("ページのエラーが無い", errors.length === 0, errors.join("\n"));
} catch (e) {
  qa.check("例外なく最後まで動く", false, e.stack ?? e);
  await p.screenshot({ path: `${OUT_DIR}step4-error.png` }).catch(() => {});
} finally {
  const seconds = Math.round((Date.now() - started) / 1000);
  writeFileSync(
    `${OUT_DIR}step4.json`,
    `${JSON.stringify({ seconds, items: qa.items }, null, 2)}\n`,
  );
  console.log(`\n${qa.items.length - qa.failed.length}/${qa.items.length} OK（${seconds} 秒）`);
  await browser.close();
  stop();
}
process.exit(qa.failed.length === 0 ? 0 : 1);
