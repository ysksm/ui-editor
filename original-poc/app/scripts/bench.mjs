// NFR-04 の目安: 画面 50・エンティティ 30・レコード合計 5,000 件のプロジェクトで、ライブラリの処理時間を測る。
// 例: pnpm --filter "./original-poc/**" build && node original-poc/app/scripts/bench.mjs [--write <file>]
// --write でプロジェクトをファイルに書く（エディタで開いて画面の反応を確かめる）
import { dataView, deleteRecords } from "@ui-editor/poc-datastore";
import { checkProject, generateScreens, serializeProject } from "@ui-editor/poc-model";
import { fireEvent, start } from "@ui-editor/poc-runtime";
import { writeFileSync } from "node:fs";
import { generateSampleData } from "@ui-editor/poc-seed";
import { generate } from "@ui-editor/poc-codegen";
import { EXAMPLES } from "@ui-editor/poc-codegen/node";

const base = EXAMPLES[0].load();
const project = structuredClone(base);
// エンティティを 30 にする（題材の 4 ＋ 単純なルートのエンティティ 26）
for (let i = 1; project.entities.length < 30; i++) {
  project.entities.push({
    id: `Item${i}`,
    name: `品目${i}`,
    primaryKey: "id",
    displayField: "name",
    fields: [
      { id: "id", type: "id" },
      { id: "name", name: "名前", type: "string", required: true },
      { id: "count", name: "数", type: "number", min: 0, max: 100 },
      { id: "active", name: "有効", type: "boolean" },
      { id: "device", name: "機器", type: "ref", entity: "Device", onDelete: "setNull" },
    ],
  });
}
const counts = { Device: 200, DeviceSettings: 200, Metric: 1600, Alarm: 1000 };
for (const e of project.entities) if (e.id.startsWith("Item")) counts[e.id] = 77;
project.data = generateSampleData(project.entities, { counts, seed: 1 }).data;
// 画面を 50 以上にする（ER からの生成を繰り返す）
project.screens = [];
project.dialogs = [];
project.entry = undefined;
for (const e of project.entities) {
  if (project.screens.length >= 50) break;
  generateScreens(project, e.id);
}
const records = Object.values(counts).reduce((a, b) => a + b, 0);

const time = (label, fn, n = 5) => {
  fn();
  const t = performance.now();
  for (let i = 0; i < n; i++) fn();
  const ms = (performance.now() - t) / n;
  console.log(`${label.padEnd(36)} ${ms.toFixed(1).padStart(8)} ms`);
  return ms;
};
console.log(
  `エンティティ ${project.entities.length}・画面 ${project.screens.length}・ダイアログ ${project.dialogs.length}・レコード ${records}`,
);
time("検証（checkProject）", () => checkProject(project));
time("決定的な書き出し（serializeProject）", () => serializeProject(project));
time("式の data（dataView、毎回新しいデータ）", () => dataView(project, { ...project.data }));
time("削除とカスケード（deleteRecords）", () =>
  deleteRecords(project, project.data, "Device", { id: "device-001" }),
);
const rt = start(project);
time("プレビューの開始（start）", () => start(project));
time("イベント 1 回（表の行クリック → 詳細）", () =>
  fireEvent(project, rt, {
    frameId: rt.history[0].id,
    node: "table",
    event: "rowClick",
    payload: { row: project.data.Device[0] },
  }),
);
const t = performance.now();
const files = await generate(project, { appName: "bench" });
console.log(
  `${"コード生成（generate）".padEnd(36)} ${(performance.now() - t).toFixed(1).padStart(8)} ms（${files.length} ファイル）`,
);

const out = process.argv.indexOf("--write");
if (out > 0) writeFileSync(process.argv[out + 1], serializeProject(project));
