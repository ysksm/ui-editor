/**
 * ステップ 2 の完了条件の QA（#110）:
 * 「ダッシュボード → 機器一覧 → 機器詳細 → 削除確認ダイアログ → 一覧に戻る、をプレビューで辿れる」
 *
 * A. 空のプロジェクトから作った「仮のボタンだけ」のフローを、プレビューで辿る。フロー図の強調も確かめる。
 * B. 題材で、行クリック（T2）・選択＋ボタン（T3）をプレビューで確かめ、遷移パネルでトリガーを
 *    「画面を開いたとき（T5）」に変えて、プレビューに効くことを確かめる。
 *
 *   pnpm --filter "./original-poc/**" build
 *   pnpm --filter @ui-editor/poc-app qa:step2
 */
import { writeFileSync } from "node:fs";
import { buildDeviceFlow, checklist, ensurePreview, openEditor, OUT_DIR } from "./lib.mjs";

const stop = await ensurePreview();
const { browser, page: p, errors } = await openEditor();
const qa = checklist();
const started = Date.now();
const pane = () => p.getByRole("complementary", { name: "プレビュー" });
const frame = (name) => pane().getByRole("region", { name, exact: true });
/** 表示されるのを少し待ってから確かめる（再描画を待つ）。 */
const visible = (locator) =>
  locator
    .first()
    .waitFor({ state: "visible", timeout: 2000 })
    .then(() => true)
    .catch(() => false);

try {
  // ---- A. 仮のボタンだけのフローを辿る ----
  await buildDeviceFlow(p);
  await p.getByRole("button", { name: "▶ プレビュー" }).click();
  qa.check("最初の画面（ダッシュボード）から始まる", await visible(frame("画面: ダッシュボード")));
  await frame("画面: ダッシュボード").getByRole("button", { name: "機器一覧へ" }).click();
  qa.check("ダッシュボード → 機器一覧", await visible(frame("画面: 機器一覧")));
  await frame("画面: 機器一覧").getByRole("button", { name: "機器詳細へ" }).click();
  qa.check("機器一覧 → 機器詳細", await visible(frame("画面: 機器詳細")));
  await frame("画面: 機器詳細").getByRole("button", { name: "削除の確認を開く" }).click();
  const dialog = pane().getByRole("dialog", { name: "削除の確認" });
  qa.check(
    "機器詳細 → 削除の確認（ダイアログを画面の上に重ねる）",
    (await visible(dialog)) && (await visible(frame("画面: 機器詳細"))),
  );
  await p.screenshot({ path: `${OUT_DIR}step2-dialog.png` });
  await dialog.getByRole("button", { name: "機器一覧へ" }).click();
  qa.check(
    "削除の確認 → 一覧に戻る（ダイアログは閉じる）",
    (await visible(frame("画面: 機器一覧"))) && !(await visible(dialog)),
  );
  await p.waitForTimeout(200);
  const current = await p.locator(".flow-node.current").getAttribute("data-container");
  const visited = await p
    .locator(".flow-node.visited")
    .evaluateAll((els) => els.map((e) => e.dataset.container));
  const edges = await p.locator("path.flow-edge.visited").count();
  qa.check("フロー図: 今いる画面（機器一覧）を強調", current === "devices", current);
  qa.check(
    "フロー図: たどった画面・ダイアログ 4 つと遷移 4 本を強調",
    ["dashboard", "devices", "deviceDetail", "deviceDelete"].every((id) => visited.includes(id)) &&
      edges === 4,
    `${visited.join(", ")} / 線 ${edges} 本`,
  );
  await p.screenshot({ path: `${OUT_DIR}step2-flow.png` });
  await pane().getByRole("button", { name: "戻る" }).click();
  qa.check(
    "「← 戻る」で前の画面（一覧に戻ったので、履歴はダッシュボード）",
    await visible(frame("画面: ダッシュボード")),
  );

  // ---- B. 題材で T2・T3、トリガーを T5 に変える ----
  await p.getByRole("button", { name: "題材を開く" }).click();
  await p.getByRole("alertdialog").getByRole("button", { name: "破棄して題材を開く" }).click();
  await frame("画面: ダッシュボード").getByRole("button", { name: "機器一覧へ" }).click();
  await frame("画面: 機器一覧").getByText("コアスイッチ B").click();
  qa.check(
    "T2 行クリック: 行の機器の詳細を開く",
    await visible(frame("画面: 機器詳細").getByRole("heading", { name: "コアスイッチ B" })),
  );
  await frame("画面: 機器詳細").getByRole("button", { name: "一覧へ戻る" }).click();
  const edit = frame("画面: 機器一覧").getByRole("button", { name: "編集" });
  qa.check("T3 選択＋ボタン: 未選択なら「編集」は押せない", await edit.isDisabled());
  await frame("画面: 機器一覧").getByLabel("dev-003 を選ぶ").check();
  qa.check("T3 選択＋ボタン: 選ぶと押せる", await edit.isEnabled());
  await edit.click();
  const form = pane().getByRole("dialog", { name: "機器の編集" });
  qa.check(
    "T3 選択＋ボタン: 選んだ機器の編集ダイアログ",
    (await form.getByLabel(/^名前/).inputValue()) === "エッジルーター 1F",
  );
  await form.getByRole("button", { name: "キャンセル" }).click();

  // 遷移パネルで「ダッシュボード → 機器一覧」を T5（画面を開いたとき）に変える
  await p
    .getByRole("navigation", { name: "ビュー" })
    .getByRole("button", { name: "フロー" })
    .click();
  await p.locator('.react-flow__node[data-id="dashboard"]').click();
  await p.getByRole("list", { name: "出ていく遷移" }).getByRole("button").first().click();
  await p.getByLabel("画面を開いたとき（T5）").check();
  await p.getByRole("button", { name: "トリガーを変更" }).click();
  qa.check(
    "遷移パネル: トリガーを T5 に変えると線のラベルが変わる",
    await visible(p.locator(".flow-edge-label", { hasText: "画面を開いたとき" })),
  );
  await pane().getByRole("button", { name: "最初から" }).click();
  qa.check(
    "T5: ダッシュボードを開くとすぐ機器一覧へ遷移する",
    await visible(frame("画面: 機器一覧")),
  );
  qa.check("ページのエラーが無い", errors.length === 0, errors.join("\n"));
} catch (e) {
  qa.check("例外なく最後まで動く", false, e.stack ?? e);
  await p.screenshot({ path: `${OUT_DIR}step2-error.png` }).catch(() => {});
} finally {
  const seconds = Math.round((Date.now() - started) / 1000);
  writeFileSync(
    `${OUT_DIR}step2.json`,
    `${JSON.stringify({ seconds, items: qa.items }, null, 2)}\n`,
  );
  console.log(`\n${qa.items.length - qa.failed.length}/${qa.items.length} OK（${seconds} 秒）`);
  await browser.close();
  stop();
}
process.exit(qa.failed.length === 0 ? 0 : 1);
