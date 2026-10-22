/**
 * ステップ 5 の完了条件の QA（#128）:
 * 「空のプロジェクトから ER だけを作り、ボタン 1 つで『機器の一覧・詳細・編集・削除』が動くアプリになる」
 *
 * 新規 → ER（機器・アラーム、1 対多の入れ子）とサンプルデータを画面の操作で作る → 機器のパネルの
 * 「画面を生成」を 1 回押す → プレビューで一覧・新規・編集・詳細・削除（カスケード）を確かめる。
 * 入れ子のアラームも「画面を生成」すると、機器の詳細から追加できることも確かめる。
 *
 *   pnpm --filter "./original-poc/**" build
 *   pnpm --filter @ui-editor/poc-app qa:step5
 */
import { writeFileSync } from "node:fs";
import {
  addRelationFromPanel,
  checklist,
  commit,
  createEntity,
  ensurePreview,
  openEditor,
  OUT_DIR,
  selectEntity,
} from "./lib.mjs";

const stop = await ensurePreview();
const { browser, page: p, errors } = await openEditor();
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
const generate = () =>
  p.getByRole("button", { name: "画面を生成（一覧・詳細・編集・削除）" }).click();

try {
  // ---- 空のプロジェクトから ER とサンプルデータ ----
  await p.getByRole("button", { name: "新規", exact: true }).click();
  await commit(p, "プロジェクト名", "QA ステップ 5");
  await nav("ER").click();
  await createEntity(p, {
    id: "Device",
    name: "機器",
    fields: [
      { id: "name", name: "名前", type: "string", required: true },
      { id: "status", name: "状態", type: "enum", values: "online, offline" },
      { id: "ipAddress", name: "IP アドレス", type: "string", format: "ipv4" },
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
  await seed.getByLabel("アラームの件数").fill("10");
  await seed.getByRole("button", { name: "生成して置き換える" }).click();
  qa.check(
    "ER（機器・アラーム）とサンプルデータだけで、画面は 0",
    (await p.getByRole("button", { name: /^検証:/ }).innerText()).trim() === "エラー 0・警告 0",
  );

  // ---- ボタン 1 つで生成 ----
  await nav("ER").click();
  await selectEntity(p, "Device");
  await generate();
  const notice = await p.locator(".notice").innerText();
  qa.check(
    "ボタン 1 つで、機器の一覧・詳細・編集・削除を作る",
    notice.includes("機器一覧、機器詳細、機器の編集、機器の削除 を作りました"),
    notice.split("\n")[0],
  );
  // 入れ子のアラームも生成（親の詳細から追加できるようになる）
  await selectEntity(p, "Alarm");
  await generate();
  const badge = (await p.getByRole("button", { name: /^検証:/ }).innerText()).trim();
  qa.check("生成後、検証の問題が 0 件", badge === "エラー 0・警告 0", badge);
  await nav("フロー").click();
  await p.getByRole("button", { name: "整列" }).click();
  await p.waitForTimeout(400);
  await p.screenshot({ path: `${OUT_DIR}step5-flow.png` });

  // ---- プレビュー ----
  await p.getByRole("button", { name: "▶ プレビュー" }).click();
  const list = () => frame("画面: 機器一覧");
  qa.check("最初の画面は機器一覧", await visible(list()));
  qa.check("一覧に機器 5 件", (await list().locator("tbody tr").count()) === 5);
  // 新規
  await list().getByRole("button", { name: "新規" }).click();
  let form = pane().getByRole("dialog", { name: "機器の編集" });
  await form.getByLabel(/^名前/).fill("QA の機器");
  await form.getByLabel(/^状態/).selectOption("online");
  await form.getByLabel(/^IP アドレス/).fill("10.0.0.1");
  await form.getByRole("button", { name: "保存" }).click();
  qa.check(
    "新規: 保存すると一覧に増える",
    (await visible(list().getByText("QA の機器"))) &&
      (await list().locator("tbody tr").count()) === 6,
  );
  // 選んで編集
  await list().locator("tbody tr").first().getByRole("radio").check();
  await list().getByRole("button", { name: "編集" }).click();
  form = pane().getByRole("dialog", { name: "機器の編集" });
  await form.getByLabel(/^名前/).fill("編集した機器");
  await form.getByRole("button", { name: "保存" }).click();
  qa.check(
    "編集: 選んで保存すると一覧に反映される",
    await visible(list().getByText("編集した機器")),
  );
  // 詳細と子の追加
  await list().getByText("編集した機器").click();
  const detail = () => frame("画面: 機器詳細");
  qa.check(
    "詳細: 行クリックで開く",
    await visible(detail().getByRole("heading", { name: "編集した機器" })),
  );
  const alarmsBefore = await detail().locator("tbody tr").count();
  await detail().getByRole("button", { name: "アラームを追加" }).click();
  const alarmForm = pane().getByRole("dialog", { name: "アラームの編集" });
  await alarmForm.getByLabel(/^レベル/).selectOption("error");
  await alarmForm.getByLabel(/^内容/).fill("QA のアラーム");
  await alarmForm.getByRole("button", { name: "保存" }).click();
  qa.check(
    "詳細から子（アラーム）を追加できる",
    await visible(detail().getByText("QA のアラーム")),
  );
  await p.screenshot({ path: `${OUT_DIR}step5-detail.png` });
  // 削除（カスケード）
  await detail().getByRole("button", { name: "削除" }).click();
  const confirm = pane().getByRole("dialog", { name: "機器の削除" });
  qa.check(
    "削除の確認に機器名",
    await visible(confirm.getByText(/「編集した機器」を削除しますか？/)),
  );
  await confirm.getByRole("button", { name: "削除する" }).click();
  qa.check(
    "削除: 一覧に戻り、機器が消える",
    (await visible(list())) && !(await list().getByText("編集した機器").isVisible()),
  );
  await pane().getByRole("button", { name: /ログ/ }).click();
  const log = await pane().getByRole("list", { name: "ログ" }).innerText();
  const line = log.split("\n").find((l) => /を削除（アラーム \d+ 件も）/.test(l)) ?? "";
  qa.check(
    "削除: その機器のアラームもカスケードで消える",
    line.includes(`アラーム ${alarmsBefore + 1} 件も`),
    line,
  );
  qa.check("ページのエラーが無い", errors.length === 0, errors.join("\n"));
} catch (e) {
  qa.check("例外なく最後まで動く", false, e.stack ?? e);
  await p.screenshot({ path: `${OUT_DIR}step5-error.png` }).catch(() => {});
} finally {
  const seconds = Math.round((Date.now() - started) / 1000);
  writeFileSync(
    `${OUT_DIR}step5.json`,
    `${JSON.stringify({ seconds, items: qa.items }, null, 2)}\n`,
  );
  console.log(`\n${qa.items.length - qa.failed.length}/${qa.items.length} OK（${seconds} 秒）`);
  await browser.close();
  stop();
}
process.exit(qa.failed.length === 0 ? 0 : 1);
