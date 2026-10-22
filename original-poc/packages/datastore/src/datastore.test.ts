import type { DataRecord, Entity } from "@ui-editor/poc-model";
import { describe, expect, it } from "vitest";
import { dataView, describeRecord, findRecord, listRecords, type Dataset } from "./locate.js";
import {
  createRecord,
  deleteRecords,
  emptyRecord,
  nextId,
  toFlat,
  updateRecords,
  validateRecord,
} from "./ops.js";

const entities: Entity[] = [
  {
    id: "Device",
    name: "機器",
    primaryKey: "id",
    displayField: "name",
    fields: [
      { id: "id", type: "id" },
      { id: "name", type: "string", required: true },
      { id: "status", type: "enum", values: ["online", "offline"], default: "online" },
      { id: "alarms", type: "children", entity: "Alarm" },
      { id: "settings", type: "children", entity: "DeviceSettings", cardinality: "one" },
    ],
  },
  {
    id: "Alarm",
    name: "アラーム",
    primaryKey: "id",
    displayField: "message",
    fields: [
      { id: "id", type: "id" },
      { id: "message", type: "string", required: true },
      { id: "level", type: "enum", values: ["info", "warn", "error"], default: "info" },
    ],
  },
  {
    id: "DeviceSettings",
    name: "機器設定",
    primaryKey: "id",
    fields: [
      { id: "id", type: "id" },
      { id: "pollingSec", type: "number", min: 5, max: 3600 },
    ],
  },
  {
    id: "User",
    name: "担当者",
    primaryKey: "id",
    displayField: "name",
    fields: [
      { id: "id", type: "id" },
      { id: "name", type: "string" },
    ],
  },
  {
    id: "Ticket",
    name: "チケット",
    primaryKey: "id",
    displayField: "title",
    fields: [
      { id: "id", type: "id" },
      { id: "title", type: "string" },
      { id: "deviceId", name: "機器", type: "ref", entity: "Device", onDelete: "setNull" },
      { id: "alarmId", name: "アラーム", type: "ref", entity: "Alarm", onDelete: "cascade" },
      { id: "ownerId", name: "担当者", type: "ref", entity: "User" },
      { id: "comments", type: "children", entity: "Comment" },
    ],
  },
  {
    id: "Comment",
    name: "コメント",
    primaryKey: "id",
    fields: [
      { id: "id", type: "id" },
      { id: "text", type: "string" },
    ],
  },
  {
    id: "Followup",
    name: "フォローアップ",
    primaryKey: "id",
    fields: [
      { id: "id", type: "id" },
      { id: "ticketId", type: "ref", entity: "Ticket", onDelete: "cascade" },
    ],
  },
];
const schema = { entities };

function sample(): Dataset {
  return {
    Device: [
      {
        id: "dev-001",
        name: "ルーター A",
        status: "online",
        alarms: [
          { id: "alm-001", message: "CPU 高負荷", level: "warn" },
          { id: "alm-002", message: "再起動", level: "info" },
        ],
        settings: { id: "set-001", pollingSec: 30 },
      },
      {
        id: "dev-002",
        name: "スイッチ B",
        status: "offline",
        alarms: [{ id: "alm-003", message: "リンクダウン", level: "error" }],
        settings: null,
      },
    ],
    User: [{ id: "usr-1", name: "佐藤" }],
    Ticket: [
      {
        id: "tic-1",
        title: "CPU 調査",
        deviceId: "dev-001",
        alarmId: "alm-001",
        ownerId: "usr-1",
        comments: [{ id: "com-1", text: "確認中" }],
      },
      {
        id: "tic-2",
        title: "交換",
        deviceId: "dev-002",
        alarmId: null,
        ownerId: "usr-1",
        comments: [],
      },
    ],
    Followup: [{ id: "fol-1", ticketId: "tic-1" }],
  };
}

const ok = <T extends { ok: boolean }>(r: T) => {
  if (!r.ok) throw new Error(JSON.stringify(r));
  return r as Extract<T, { ok: true }>;
};

describe("索引と一覧", () => {
  it("主キーで入れ子の中のレコードと親を引ける", () => {
    const data = sample();
    const loc = findRecord(schema, data, "Alarm", "alm-003");
    expect(loc?.path).toEqual(["Device", 1, "alarms", 0]);
    expect(loc?.parent?.record.id).toBe("dev-002");
    expect(findRecord(schema, data, "DeviceSettings", "set-001")?.path).toEqual([
      "Device",
      0,
      "settings",
    ]);
  });

  it("入れ子のエンティティは全親の子を並べた一覧になる（式の data 用）", () => {
    const data = sample();
    const view = dataView(schema, data);
    expect(view.Device).toBe(data.Device);
    expect(view.Alarm!.map((a) => a.id)).toEqual(["alm-001", "alm-002", "alm-003"]);
    expect(view.Comment!.map((a) => a.id)).toEqual(["com-1"]);
    expect(dataView(schema, data)).toBe(view);
    expect(listRecords(schema, data, "DeviceSettings")).toHaveLength(1);
  });

  it("表示名は displayField、無ければ主キー", () => {
    expect(describeRecord(entities[0]!, { id: "dev-1", name: "A" })).toBe("A");
    expect(describeRecord(entities[2]!, { id: "set-1" })).toBe("set-1");
  });
});

describe("createRecord", () => {
  it("ルートのレコードを、採番・既定値・フィールド順で作る", () => {
    const data = sample();
    const r = ok(createRecord(schema, data, "Device", { name: "新しい機器" }));
    expect(r.record).toEqual({
      id: "dev-003",
      name: "新しい機器",
      status: "online",
      alarms: [],
      settings: null,
    });
    expect(Object.keys(r.record)).toEqual(["id", "name", "status", "alarms", "settings"]);
    expect(r.data.Device).toHaveLength(3);
    expect(r.changes).toEqual([
      { kind: "create", entity: "Device", id: "dev-003", reason: "match" },
    ]);
    expect(data.Device).toHaveLength(2);
  });

  it("検証エラーは項目ごとに返し、データは変えない", () => {
    const data = sample();
    expect(createRecord(schema, data, "Device", { status: "broken", color: "red" })).toEqual({
      ok: false,
      error: "入力に誤りがあります",
      fieldErrors: {
        color: "定義に無い項目です",
        name: "必須の項目です",
        status: "online / offline のどれかにしてください",
      },
    });
    expect(createRecord(schema, data, "Device", { id: "dev-001", name: "x" })).toMatchObject({
      ok: false,
      fieldErrors: { id: '主キー "dev-001" は既にあります' },
    });
    expect(createRecord(schema, data, "Ticket", { deviceId: "dev-999" })).toMatchObject({
      ok: false,
      fieldErrors: { deviceId: '参照先の Device "dev-999" がありません' },
    });
  });

  it("入れ子のエンティティは親の下に足し、ほかの枝は共有する", () => {
    const data = sample();
    const r = ok(createRecord(schema, data, "Alarm", { message: "温度" }, { parent: "dev-002" }));
    expect(r.record).toEqual({ id: "alm-004", message: "温度", level: "info" });
    expect((r.data.Device![1]!.alarms as DataRecord[]).map((a) => a.id)).toEqual([
      "alm-003",
      "alm-004",
    ]);
    expect(r.data.Device![0]).toBe(data.Device![0]);
    expect(r.data.Ticket).toBe(data.Ticket);
    expect(data.Device![1]!.alarms).toHaveLength(1);
  });

  it("入れ子の作成には親が必要、1 件だけの子は 2 件目を作れない", () => {
    const data = sample();
    expect(createRecord(schema, data, "Alarm", { message: "x" })).toMatchObject({
      ok: false,
      error: expect.stringContaining("親（Device）を指定してください"),
    });
    expect(
      createRecord(schema, data, "Alarm", { message: "x" }, { parent: "dev-9" }),
    ).toMatchObject({
      ok: false,
      error: '親の Device "dev-9" がありません',
    });
    expect(
      createRecord(schema, data, "DeviceSettings", { pollingSec: 10 }, { parent: "dev-001" }),
    ).toMatchObject({
      ok: false,
      error: expect.stringContaining("既に DeviceSettings があります"),
    });
    const r = ok(
      createRecord(schema, data, "DeviceSettings", { pollingSec: 10 }, { parent: "dev-002" }),
    );
    expect(r.data.Device![1]!.settings).toEqual({ id: "set-002", pollingSec: 10 });
    expect(createRecord(schema, data, "Device", { name: "x" }, { parent: "dev-001" }).ok).toBe(
      false,
    );
    expect(createRecord(schema, data, "Device", { name: "x", alarms: [] }).ok).toBe(false);
  });
});

describe("updateRecords", () => {
  it("入れ子の中のレコードを主キーで更新する", () => {
    const data = sample();
    const r = ok(updateRecords(schema, data, "Alarm", { id: "alm-002" }, { level: "error" }));
    expect(findRecord(schema, r.data, "Alarm", "alm-002")?.record).toEqual({
      id: "alm-002",
      message: "再起動",
      level: "error",
    });
    expect(r.changes).toEqual([
      { kind: "update", entity: "Alarm", id: "alm-002", fields: ["level"], reason: "match" },
    ]);
    expect(r.data.Device![1]).toBe(data.Device![1]);
    expect(findRecord(schema, data, "Alarm", "alm-002")?.record.level).toBe("info");
  });

  it("条件に合うものをすべて更新する。合うものが無ければ何もしない", () => {
    const data = sample();
    const r = ok(updateRecords(schema, data, "Alarm", { level: "warn" }, { message: "確認済み" }));
    expect(r.changes.map((c) => c.id)).toEqual(["alm-001"]);
    const none = ok(updateRecords(schema, data, "Alarm", { level: "none" }, { message: "x" }));
    expect(none.data).toBe(data);
    expect(none.changes).toEqual([]);
  });

  it("主キー・children・定義に無い項目・不正な値は変えられない", () => {
    const data = sample();
    expect(updateRecords(schema, data, "Device", { id: "dev-001" }, { id: "dev-9" }).ok).toBe(
      false,
    );
    expect(updateRecords(schema, data, "Device", { id: "dev-001" }, { alarms: [] }).ok).toBe(false);
    expect(updateRecords(schema, data, "Device", { id: "dev-001" }, { nam: "x" }).ok).toBe(false);
    expect(updateRecords(schema, data, "Device", { id: "dev-001" }, { name: "" })).toMatchObject({
      ok: false,
      fieldErrors: { name: "必須の項目です" },
    });
  });
});

describe("deleteRecords", () => {
  it("子ごと消し、参照の cascade を連鎖させる", () => {
    const data = sample();
    const r = ok(deleteRecords(schema, data, "Device", { id: "dev-001" }));
    expect(r.changes).toEqual([
      { kind: "delete", entity: "Device", id: "dev-001", reason: "match" },
      { kind: "delete", entity: "Alarm", id: "alm-001", reason: "nested" },
      { kind: "delete", entity: "Alarm", id: "alm-002", reason: "nested" },
      { kind: "delete", entity: "DeviceSettings", id: "set-001", reason: "nested" },
      { kind: "delete", entity: "Ticket", id: "tic-1", reason: "cascade" },
      { kind: "delete", entity: "Comment", id: "com-1", reason: "nested" },
      { kind: "delete", entity: "Followup", id: "fol-1", reason: "cascade" },
    ]);
    expect(r.data.Device!.map((d) => d.id)).toEqual(["dev-002"]);
    expect(r.data.Ticket!.map((t) => t.id)).toEqual(["tic-2"]);
    expect(r.data.Followup).toEqual([]);
    expect(r.data.User).toBe(data.User);
  });

  it("setNull の参照は null にする", () => {
    const r = ok(deleteRecords(schema, sample(), "Device", { id: "dev-002" }));
    expect(r.changes).toEqual([
      { kind: "delete", entity: "Device", id: "dev-002", reason: "match" },
      { kind: "delete", entity: "Alarm", id: "alm-003", reason: "nested" },
      { kind: "update", entity: "Ticket", id: "tic-2", fields: ["deviceId"], reason: "setNull" },
    ]);
    expect(findRecord(schema, r.data, "Ticket", "tic-2")?.record.deviceId).toBeNull();
  });

  it("restrict（既定）で参照が残るなら、何も変えずにエラー", () => {
    expect(deleteRecords(schema, sample(), "User", { id: "usr-1" })).toEqual({
      ok: false,
      error:
        "参照されているため削除できません: チケット「CPU 調査」の 担当者、チケット「交換」の 担当者",
    });
  });

  it("必須の参照は setNull でも消せない", () => {
    const required = entities.map((e) =>
      e.id === "Ticket"
        ? {
            ...e,
            fields: e.fields.map((f) => (f.id === "deviceId" ? { ...f, required: true } : f)),
          }
        : e,
    );
    const r = deleteRecords({ entities: required }, sample(), "Device", { id: "dev-002" });
    expect(r).toMatchObject({
      ok: false,
      error: expect.stringContaining("チケット「交換」の 機器"),
    });
  });

  it("合うものが無ければ何もしない", () => {
    const data = sample();
    expect(deleteRecords(schema, data, "Alarm", { id: "none" })).toEqual({
      ok: true,
      data,
      changes: [],
    });
  });
});

describe("補助", () => {
  it("nextId は既存の接頭辞と桁にそろえる", () => {
    const data = sample();
    expect(nextId(schema, data, "Device")).toBe("dev-003");
    expect(nextId(schema, data, "DeviceSettings")).toBe("set-002");
    expect(nextId(schema, data, "Followup")).toBe("fol-2");
    expect(nextId(schema, { ...data, Device: [] }, "DeviceSettings")).toBe("device-settings-001");
  });

  it("emptyRecord は既定値か型ごとの空の値", () => {
    expect(emptyRecord(entities[0]!)).toEqual({
      name: "",
      status: "online",
      alarms: [],
      settings: null,
    });
    expect(emptyRecord(entities[4]!)).toEqual({
      title: "",
      deviceId: null,
      alarmId: null,
      ownerId: null,
      comments: [],
    });
  });

  it("validateRecord は自分自身の主キーを重複とみなさない", () => {
    const data = sample();
    expect(
      validateRecord(schema, data, "Device", { id: "dev-001", name: "x" }, { selfId: "dev-001" }),
    ).toEqual({});
  });

  it("toFlat は入れ子をほどき、親の主キーを $parent に入れる", () => {
    const flat = toFlat(schema, sample());
    expect(flat.Alarm![2]).toEqual({
      id: "alm-003",
      message: "リンクダウン",
      level: "error",
      $parent: "dev-002",
    });
    expect(flat.Device![0]).toEqual({ id: "dev-001", name: "ルーター A", status: "online" });
  });
});

describe("性能（NFR-04）", () => {
  it("レコード 5,000 件でも作成・更新・削除が速い", () => {
    const devices: DataRecord[] = Array.from({ length: 100 }, (_, i) => ({
      id: `dev-${i}`,
      name: `機器 ${i}`,
      status: "online",
      alarms: Array.from({ length: 49 }, (_, j) => ({
        id: `alm-${i}-${j}`,
        message: "m",
        level: "info",
      })),
      settings: null,
    }));
    let data: Dataset = { Device: devices };
    const start = performance.now();
    data = ok(createRecord(schema, data, "Alarm", { message: "new" }, { parent: "dev-50" })).data;
    data = ok(updateRecords(schema, data, "Alarm", { id: "alm-70-3" }, { level: "warn" })).data;
    data = ok(deleteRecords(schema, data, "Device", { id: "dev-10" })).data;
    const elapsed = performance.now() - start;
    expect(listRecords(schema, data, "Alarm")).toHaveLength(100 * 49 + 1 - 49);
    expect(elapsed).toBeLessThan(500);
  });
});
