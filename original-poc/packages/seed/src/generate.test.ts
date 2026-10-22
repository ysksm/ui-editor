import { readFileSync } from "node:fs";
import {
  checkProject,
  formatIssue,
  loadProject,
  walkData,
  type DataRecord,
  type Entity,
  type Project,
} from "@ui-editor/poc-model";
import { describe, expect, it } from "vitest";
import { defaultCounts, generateSampleData } from "./generate.js";

const example = loadProject(
  readFileSync(new URL("../../../examples/device-monitor.poc.json", import.meta.url), "utf8"),
);
if (!example.success) throw new Error("題材を読み込めない");
const entities = example.project.entities;

/** 生成したデータを ER だけのプロジェクトに入れて検証する。 */
function check(es: readonly Entity[], data: Project["data"]) {
  return checkProject({
    schemaVersion: "poc-0",
    name: "t",
    entities: [...es],
    data,
    state: {},
    screens: [],
    dialogs: [],
  }).map(formatIssue);
}

function count(es: readonly Entity[], data: Project["data"]): Record<string, number> {
  const out: Record<string, number> = {};
  walkData(
    { entities: [...es], data },
    ({ entity }) => (out[entity.id] = (out[entity.id] ?? 0) + 1),
  );
  return out;
}

describe("generateSampleData", () => {
  it("機器 5 件・アラーム 20 件を、入れ子が壊れていない状態で作る（検証の問題 0 件）", () => {
    const r = generateSampleData(entities, { counts: { Device: 5, Alarm: 20 } });
    expect(check(entities, r.data)).toEqual([]);
    expect(count(entities, r.data)).toEqual({
      Device: 5,
      DeviceSettings: 5,
      Metric: 15,
      Alarm: 20,
    });
    expect(r.counts).toEqual({ Device: 5, DeviceSettings: 5, Metric: 15, Alarm: 20 });
    expect(r.warnings).toEqual([]);
    // どの機器にもアラームが 1 件以上ある
    for (const d of r.data.Device!) expect((d.alarms as DataRecord[]).length).toBeGreaterThan(0);
  });

  it("同じシードなら同じデータ、違うシードなら違うデータ", () => {
    const a = generateSampleData(entities, { seed: 7 });
    const b = generateSampleData(entities, { seed: 7 });
    const c = generateSampleData(entities, { seed: 8 });
    expect(b.data).toEqual(a.data);
    expect(c.data).not.toEqual(a.data);
  });

  it("値は型・列挙値・範囲・書式に合う", () => {
    const r = generateSampleData(entities, { counts: { Device: 3 } });
    const device = r.data.Device![0]!;
    expect(device).toMatchObject({ id: "device-001", name: "機器 1" });
    expect(device.ipAddress).toMatch(/^192\.168\.\d+\.\d+$/);
    expect(["online", "offline", "warning"]).toContain(device.status);
    const settings = device.settings as DataRecord;
    expect(settings.id).toBe("device-settings-001");
    expect(Number.isInteger(settings.pollingIntervalSec)).toBe(true);
    const metric = (device.metrics as DataRecord[])[0]!;
    expect(metric.timestamp).toMatch(/^2026-09-\d\dT\d\d:\d\d:00\.000Z$/);
    expect(metric.cpu as number).toBeGreaterThanOrEqual(0);
    expect(metric.cpu as number).toBeLessThanOrEqual(100);
  });

  it("ref は実在するレコードを指す", () => {
    const es: Entity[] = [
      ...entities,
      {
        id: "Ticket",
        name: "チケット",
        primaryKey: "id",
        fields: [
          { id: "id", type: "id" },
          { id: "title", type: "string" },
          { id: "deviceId", type: "ref", entity: "Device", required: true },
          { id: "alarmId", type: "ref", entity: "Alarm" },
        ],
      },
    ];
    const r = generateSampleData(es, { counts: { Ticket: 10 } });
    expect(check(es, r.data)).toEqual([]);
    expect(r.data.Ticket).toHaveLength(10);
    for (const t of r.data.Ticket!) {
      expect(t.deviceId).toMatch(/^device-\d{3}$/);
      expect(t.alarmId).toMatch(/^alarm-\d{3}$/);
    }
  });

  it("参照先が 0 件の必須の ref は警告", () => {
    const es: Entity[] = [
      { id: "A", name: "A", primaryKey: "id", fields: [{ id: "id", type: "id" }] },
      {
        id: "B",
        name: "B",
        primaryKey: "id",
        fields: [
          { id: "id", type: "id" },
          { id: "aId", type: "ref", entity: "A", required: true },
        ],
      },
    ];
    const r = generateSampleData(es, { counts: { A: 0, B: 2 } });
    expect(r.warnings).toEqual(["B.aId: 参照先の A が 0 件なので null にしました"]);
  });

  it("件数が親より少なければ、一部の親だけが子を持つ。1 件だけの子は親の数まで", () => {
    const r = generateSampleData(entities, { counts: { Device: 4, Alarm: 2, DeviceSettings: 9 } });
    const alarms = r.data.Device!.map((d) => (d.alarms as DataRecord[]).length);
    expect(alarms.reduce((a, b) => a + b, 0)).toBe(2);
    expect(alarms.filter((n) => n > 0)).toHaveLength(2);
    expect(r.counts.DeviceSettings).toBe(4);
    expect(r.warnings).toEqual(["DeviceSettings: 親 1 件につき 1 件までなので 4 件にしました"]);
  });

  it("既定の件数: ルート 5 件、入れ子は親 1 件あたり 3 件、1 件だけの子は親と同じ数", () => {
    expect(defaultCounts(entities)).toEqual({
      Device: 5,
      DeviceSettings: 5,
      Metric: 15,
      Alarm: 15,
    });
    expect(defaultCounts(entities, { Device: 2 })).toEqual({
      Device: 2,
      DeviceSettings: 2,
      Metric: 6,
      Alarm: 6,
    });
  });
});
