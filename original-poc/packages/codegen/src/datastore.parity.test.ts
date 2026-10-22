import * as poc from "@ui-editor/poc-datastore";
import type { DataRecord, Entity, Project } from "@ui-editor/poc-model";
import { describe, expect, it } from "vitest";
import * as gen from "../templates/src/runtime/datastore.js";
import { toRuntimeSchema } from "./emit/model.js";
import { EXAMPLES } from "./node.js";

/**
 * 生成アプリに入れるデータ操作（templates/src/runtime/datastore.ts）が、
 * プレビュー（poc-datastore）と同じ結果になることを確かめる。
 */

const example = EXAMPLES[0]!.load();

/** 参照（ref）の onDelete を確かめるための ER。 */
const refEntities: Entity[] = [
  {
    id: "Site",
    name: "拠点",
    primaryKey: "id",
    displayField: "name",
    fields: [
      { id: "id", type: "id" },
      { id: "name", name: "名前", type: "string", required: true },
    ],
  },
  {
    id: "Rack",
    name: "ラック",
    primaryKey: "id",
    fields: [
      { id: "id", type: "id" },
      { id: "site", name: "拠点", type: "ref", entity: "Site", onDelete: "cascade" },
    ],
  },
  {
    id: "Staff",
    name: "担当者",
    primaryKey: "id",
    displayField: "name",
    fields: [
      { id: "id", type: "id" },
      { id: "name", type: "string" },
      { id: "site", name: "所属拠点", type: "ref", entity: "Site", onDelete: "setNull" },
      { id: "rack", name: "担当ラック", type: "ref", entity: "Rack" },
    ],
  },
];
const refData: Project["data"] = {
  Site: [
    { id: "s-1", name: "東京" },
    { id: "s-2", name: "大阪" },
  ],
  Rack: [
    { id: "r-1", site: "s-1" },
    { id: "r-2", site: "s-2" },
  ],
  Staff: [
    { id: "p-1", name: "佐藤", site: "s-1", rack: null },
    { id: "p-2", name: "鈴木", site: "s-2", rack: "r-2" },
  ],
};

interface Case {
  name: string;
  run: (
    ds: Pick<typeof poc, "createRecord" | "updateRecords" | "deleteRecords" | "nextId">,
    schema: unknown,
    data: Project["data"],
  ) => unknown;
}

/** 同じ操作を両方で行い、結果（ok・data・changes・エラー）を比べる。 */
function compare(entities: Entity[], data: Project["data"], cases: Case[]) {
  const pocSchema = { entities };
  const genSchema = toRuntimeSchema({ entities });
  const adapt = {
    createRecord: (
      s: unknown,
      d: Project["data"],
      e: string,
      v: DataRecord,
      o?: { parent?: string },
    ) => gen.createRecord(s as gen.Schema, d, e, v, o?.parent),
    updateRecords: (s: unknown, d: Project["data"], e: string, m: DataRecord, set: DataRecord) =>
      gen.updateRecords(s as gen.Schema, d, e, m, set),
    deleteRecords: (s: unknown, d: Project["data"], e: string, m: DataRecord) =>
      gen.deleteRecords(s as gen.Schema, d, e, m),
    nextId: (s: unknown, d: Project["data"], e: string) => gen.nextId(s as gen.Schema, d, e),
  };
  for (const c of cases) {
    it(c.name, () => {
      const expected = c.run(poc as never, pocSchema, data);
      const actual = c.run(adapt as never, genSchema, data);
      expect(actual).toEqual(expected);
    });
  }
}

describe("題材（入れ子）", () => {
  compare(example.entities, example.data, [
    {
      name: "ルートのレコードを作る（採番・既定値）",
      run: (ds, s, d) => ds.createRecord(s as never, d, "Device", { name: "新しい機器" }),
    },
    {
      name: "必須・列挙値の誤り",
      run: (ds, s, d) => ds.createRecord(s as never, d, "Device", { status: "broken" }),
    },
    {
      name: "入れ子のレコードを親の中に作る",
      run: (ds, s, d) =>
        ds.createRecord(
          s as never,
          d,
          "Alarm",
          { level: "warn", message: "温度が高い" },
          { parent: "dev-002" },
        ),
    },
    {
      name: "入れ子のレコードに親が無い・親が見つからない",
      run: (ds, s, d) => [
        ds.createRecord(s as never, d, "Alarm", { level: "info", message: "x" }),
        ds.createRecord(
          s as never,
          d,
          "Alarm",
          { level: "info", message: "x" },
          { parent: "dev-999" },
        ),
      ],
    },
    {
      name: "1 件だけの入れ子に 2 件目",
      run: (ds, s, d) =>
        ds.createRecord(s as never, d, "DeviceSettings", {}, { parent: "dev-001" }),
    },
    {
      name: "範囲の外の数値",
      run: (ds, s, d) =>
        ds.updateRecords(s as never, d, "DeviceSettings", { id: "set-001" }, { cpuMax: 150 }),
    },
    {
      name: "更新（入れ子の中の項目）と、主キーは変えられない",
      run: (ds, s, d) => [
        ds.updateRecords(s as never, d, "Alarm", { level: "error" }, { acknowledged: true }),
        ds.updateRecords(s as never, d, "Device", { id: "dev-001" }, { id: "dev-100" }),
      ],
    },
    {
      name: "子ごと削除",
      run: (ds, s, d) => ds.deleteRecords(s as never, d, "Device", { id: "dev-003" }),
    },
    {
      name: "採番",
      run: (ds, s, d) => ["Device", "Alarm", "Metric"].map((e) => ds.nextId(s as never, d, e)),
    },
  ]);

  it("式の data（入れ子のエンティティは全親の子を並べた一覧）", () => {
    const view = gen.dataView(toRuntimeSchema(example), example.data);
    expect(view).toEqual(poc.dataView(example, example.data));
  });
});

describe("参照（ref）の onDelete", () => {
  compare(refEntities, refData, [
    {
      name: "cascade で消え、setNull で null になり、restrict で止まる",
      run: (ds, s, d) => [
        ds.deleteRecords(s as never, d, "Site", { id: "s-1" }),
        ds.deleteRecords(s as never, d, "Site", { id: "s-2" }),
      ],
    },
    {
      name: "参照先が無い ref は作れない",
      run: (ds, s, d) => ds.createRecord(s as never, d, "Rack", { site: "s-9" }),
    },
  ]);
});
