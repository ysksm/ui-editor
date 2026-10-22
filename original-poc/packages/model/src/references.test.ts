import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { loadProject } from "./io.js";
import { describeReferences, findReferences } from "./references.js";

const r = loadProject(
  readFileSync(new URL("../../../examples/device-monitor.poc.json", import.meta.url), "utf8"),
);
if (!r.success) throw new Error("題材");
const project = r.project;

describe("findReferences", () => {
  it("エンティティを参照している ER・画面・パラメータ・部品・アクション・式・データ", () => {
    const msgs = findReferences(project, { entity: "Device" }).map((x) => x.message);
    expect(msgs).toEqual(
      expect.arrayContaining([
        "画面「機器一覧」の扱うエンティティ",
        "画面「機器詳細」のパラメータ deviceId",
        "画面「機器一覧」の表 table",
        "画面「機器一覧」のボタン edit の requires",
        "画面「機器一覧」の部品 table: {{ data.Device }}",
        "ダイアログ「削除の確認」のアクション deleteRecord",
        "機器のデータ 5 件",
      ]),
    );
    const alarm = findReferences(project, { entity: "Alarm" }).map((x) => x.message);
    expect(alarm).toEqual(
      expect.arrayContaining([
        "機器.alarms（入れ子）",
        "画面「ダッシュボード」の部品 alarms: {{ data.Alarm.filter((a) => !a.acknowledged) }}",
        "アラームのデータ 10 件",
      ]),
    );
  });

  it("属性を参照している式・アクション・下書き・データ", () => {
    const refs = findReferences(project, { entity: "Device", field: "name" });
    const msgs = refs.map((x) => x.message);
    expect(msgs).toEqual(
      expect.arrayContaining([
        "機器の表示用フィールド",
        "画面「機器一覧」の部品 table: {{ row.name }}",
        "画面「機器詳細」の部品 title: {{ record?.name }}",
        "ダイアログ「機器の編集」の部品 name: {{ draft.name }}",
        "ダイアログ「機器の編集」のアクション setDraft の name",
        "データ 5 件の name の値",
      ]),
    );
    expect(refs.filter((x) => x.expression).length).toBeGreaterThan(0);
    expect(describeReferences(refs, 2)).toMatch(/^・.+\n・.+\nほか \d+ 件$/);
  });

  it("参照が無ければ空", () => {
    expect(
      findReferences(project, { entity: "Metric", field: "trafficMbps" }).map((x) => x.message),
    ).toEqual(["データ 15 件の trafficMbps の値"]);
    expect(findReferences(project, { entity: "Nope" })).toEqual([]);
  });
});
