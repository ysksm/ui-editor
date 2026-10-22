import { listRecords } from "@ui-editor/poc-datastore";
import { generateScreens, loadProject, type DataRecord, type Project } from "@ui-editor/poc-model";
import { produce } from "immer";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { currentFrame, fireEvent, start } from "./engine.js";
import { scopeFor } from "./scope.js";
import type { RuntimeState } from "./types.js";

/** 題材の ER とデータだけから、generateScreens（機器・アラーム）で作ったアプリ。 */
function generated(): Project {
  const r = loadProject(
    readFileSync(new URL("../../../examples/device-monitor.poc.json", import.meta.url), "utf8"),
  );
  if (!r.success) throw new Error("題材");
  const base: Project = {
    ...r.project,
    entry: undefined,
    screens: [],
    dialogs: [],
    layout: undefined,
  };
  const apply = (p: Project, recipe: (d: Project) => void) => produce(p, recipe);
  return apply(base, (d) => {
    generateScreens(d, "Device");
    generateScreens(d, "Alarm");
  });
}

const top = (rt: RuntimeState) => currentFrame(rt)!;
const fire = (p: Project, rt: RuntimeState, node: string, event = "click", payload?: unknown) =>
  fireEvent(p, rt, { frameId: top(rt).id, node, event, payload });
const change = (p: Project, rt: RuntimeState, node: string, value: unknown) =>
  fire(p, rt, node, "change", { value });
const devices = (rt: RuntimeState) => rt.data.Device!;

describe("生成したアプリのランタイム", () => {
  const p = generated();

  it("新規・選択して編集・保存が一覧に反映される", () => {
    let rt = start(p);
    expect(top(rt).container).toBe("devices");
    rt = fire(p, rt, "newButton");
    expect(top(rt)).toMatchObject({ container: "deviceForm", params: {} });
    rt = change(p, rt, "nameInput", "新しい機器");
    rt = change(p, rt, "statusInput", "online");
    rt = fire(p, rt, "save");
    expect(rt.dialogs).toEqual([]);
    expect(devices(rt).at(-1)).toMatchObject({ id: "dev-006", name: "新しい機器" });

    rt = fire(p, rt, "table", "rowSelect", { row: devices(rt)[2] });
    rt = fire(p, rt, "editButton");
    expect(top(rt).draft).toMatchObject({ id: "dev-003" });
    rt = change(p, rt, "nameInput", "エッジルーター 改");
    rt = fire(p, rt, "save");
    expect(devices(rt)[2]!.name).toBe("エッジルーター 改");
  });

  it("詳細から子（アラーム）を追加・子の詳細から削除・親を削除するとカスケード", () => {
    let rt = start(p);
    rt = fire(p, rt, "table", "rowClick", { row: devices(rt)[0] });
    expect(top(rt)).toMatchObject({ container: "deviceDetail", params: { deviceId: "dev-001" } });
    rt = fire(p, rt, "addAlarmButton");
    expect(top(rt)).toMatchObject({ container: "alarmForm", params: { deviceId: "dev-001" } });
    rt = change(p, rt, "levelInput", "error");
    rt = change(p, rt, "messageInput", "電源異常");
    rt = change(p, rt, "occurredAtInput", "2026-10-23T09:00:00Z");
    rt = fire(p, rt, "save");
    expect(rt.dialogs).toEqual([]);
    const record = scopeFor(p, rt, top(rt)).record as DataRecord;
    expect((record.alarms as DataRecord[]).map((a) => a.message)).toContain("電源異常");

    // 子の一覧の行 → 子の詳細 → 削除 → 親の詳細に戻る
    const added = (record.alarms as DataRecord[]).find((a) => a.message === "電源異常")!;
    rt = fire(p, rt, "alarmsTable", "rowClick", { row: added });
    expect(top(rt)).toMatchObject({ container: "alarmDetail", params: { alarmId: added.id } });
    rt = fire(p, rt, "deleteButton");
    rt = fire(p, rt, "ok");
    expect(top(rt).container).toBe("deviceDetail");
    expect(listRecords(p, rt.data, "Alarm").some((a) => a.id === added.id)).toBe(false);

    // 親を削除すると子も消える
    const before = listRecords(p, rt.data, "Alarm").length;
    rt = fire(p, rt, "deleteButton");
    rt = fire(p, rt, "ok");
    expect(top(rt).container).toBe("devices");
    expect(devices(rt).map((d) => d.id)).not.toContain("dev-001");
    expect(listRecords(p, rt.data, "Alarm")).toHaveLength(before - 2);
  });
});
