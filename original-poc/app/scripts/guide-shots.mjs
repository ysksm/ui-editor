/**
 * 使い方の手順（docs/user-guide.html）のスクリーンショットを撮る。
 * 手順書と同じ操作（空から機器・アラームのアプリを作る）を行い、docs/images/guide/ に保存する。
 * エディタの画面が変わったら撮り直す。
 *
 *   pnpm --filter "./original-poc/**" build
 *   pnpm --filter @ui-editor/poc-app guide:shots
 */
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  addRelationFromPanel,
  commit,
  createEntity,
  dragConnect,
  ensurePreview,
  openEditor,
  selectEntity,
} from "../qa/lib.mjs";

const DIR = fileURLToPath(new URL("../../docs/images/guide/", import.meta.url));
mkdirSync(DIR, { recursive: true });

const stop = await ensurePreview();
const { browser, page: p, errors } = await openEditor();
const nav = (name) => p.getByRole("navigation", { name: "ビュー" }).getByRole("button", { name });
const outline = () => p.getByRole("region", { name: "中身" });
const panel = () => p.getByRole("region", { name: "部品の編集" });
const pane = () => p.getByRole("complementary", { name: "プレビュー" });
const shot = async (name) => {
  // 図があれば全体が入るように合わせる（プレビューを開くと図の幅が変わる）
  const fit = p.locator(".react-flow__controls-fitview");
  if (await fit.isVisible()) await fit.click();
  await p.waitForTimeout(400);
  await p.screenshot({ path: `${DIR}${name}.png` });
  console.log(`${name}.png`);
};

try {
  // 起動直後（題材が開く）。フローとプレビューを並べる
  await nav("フロー").click();
  await p.getByRole("button", { name: "▶ プレビュー" }).click();
  await p.waitForTimeout(400);
  await shot("01-overview");
  await p.getByRole("button", { name: "▶ プレビュー" }).click();

  // ER: エンティティと属性
  await p.getByRole("button", { name: "新規", exact: true }).click();
  await commit(p, "プロジェクト名", "機器の管理");
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
  await shot("02-er-entity");
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
  await shot("03-er-relation");

  // データ: サンプルデータ
  await nav("データ").click();
  await p.getByRole("button", { name: "サンプルデータを生成…" }).click();
  const seed = p.getByRole("dialog", { name: "サンプルデータの生成" });
  await seed.getByLabel("機器の件数").fill("5");
  await seed.getByLabel("アラームの件数").fill("12");
  await shot("04-data-seed");
  await seed.getByRole("button", { name: "生成して置き換える" }).click();
  await shot("05-data-table");

  // ER: 画面を生成
  await nav("ER").click();
  for (const id of ["Device", "Alarm"]) {
    await selectEntity(p, id);
    await p.getByRole("button", { name: "画面を生成（一覧・詳細・編集・削除）" }).click();
  }
  await selectEntity(p, "Device");
  await shot("06-er-generate");

  // フロー: 整列と遷移を引く
  await nav("フロー").click();
  await p.getByRole("button", { name: "整列" }).click();
  await p.waitForTimeout(400);
  await dragConnect(p, "deviceDetail", "alarms");
  await p.waitForTimeout(200);
  await shot("07-flow");

  // 検証パネル
  await p.getByRole("button", { name: /^検証:/ }).click();
  await shot("08-issues");
  await p
    .getByRole("region", { name: "検証の結果" })
    .getByRole("button", { name: "閉じる" })
    .click();

  // 画面: 部品を足し、文言を変え、遷移を移す
  await nav("画面").click();
  await p
    .getByRole("navigation", { name: "画面とダイアログ" })
    .getByRole("button", { name: /機器詳細/ })
    .click();
  await outline().getByText("toolbar", { exact: true }).click();
  await outline().getByLabel("部品を追加").selectOption("Button");
  const button = await panel().getByLabel("部品の id").inputValue();
  await commit(p, `文言（${button}）`, "全アラームを見る");
  await outline().getByText("page", { exact: true }).click();
  await outline().getByLabel("部品を追加").selectOption("Text");
  const count = await panel().getByLabel("部品の id").inputValue();
  await commit(p, `文言（${count}）`, "アラーム件数: {{ (record?.alarms ?? []).length }}");
  await shot("09-screen-binding");
  await outline().getByText(button, { exact: true }).click();
  await panel()
    .getByRole("list", { name: "仮の部品の遷移" })
    .getByRole("button", { name: "この部品に移す" })
    .click();
  await shot("10-screen-transition");

  // プレビュー（フロー図と並べる）
  await nav("フロー").click();
  await p.getByRole("button", { name: "▶ プレビュー" }).click();
  await pane().getByRole("button", { name: "最初から" }).click();
  const list = pane().getByRole("region", { name: "画面: 機器一覧", exact: true });
  await list.locator("tbody tr").first().getByRole("radio").check();
  await shot("11-preview");
  await list.getByRole("button", { name: "編集" }).click();
  await shot("12-preview-dialog");
  await pane()
    .getByRole("dialog", { name: "機器の編集" })
    .getByRole("button", { name: "保存" })
    .click();

  if (errors.length > 0) throw new Error(`ページのエラー: ${errors.join("\n")}`);
} finally {
  await browser.close();
  stop();
}
