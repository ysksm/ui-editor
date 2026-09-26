import type { Action, Project } from "@ui-editor/schema";
import { describe, expect, it } from "vitest";
import { exampleProject } from "../example.test-util.js";
import { freeze, initRuntime, runActions, setPath, type RuntimeState } from "./runtime.js";

const project = exampleProject();
const start = () => initRuntime(project).state;
const run = (rt: RuntimeState, actions: Action[], context = {}) =>
  runActions(project, rt, actions, context);
type Rec = Record<string, unknown>;
const find = (rt: RuntimeState, collection: string, key: string, value: unknown) =>
  rt.data[collection]!.find((r) => (r as Rec)[key] === value) as Rec;

describe("initRuntime", () => {
  it("starts at the entry screen with the sample data and initial state", () => {
    const { state, log } = initRuntime(project);
    expect(state.screen).toEqual({ id: "dashboard", params: {} });
    expect(state.dialogs).toEqual([]);
    expect(state.state).toEqual({ draftSettings: null });
    expect(state.data).toEqual(project.sampleData);
    expect(log).toEqual([]);
    expect(Object.isFrozen(state.data.devices![0])).toBe(true);
  });
});

describe("navigate", () => {
  it("moves to the screen with resolved params and runs its mount", () => {
    const { state, log } = run(
      start(),
      [{ type: "navigate", to: "deviceSettings", params: { deviceId: "{{ event.row.id }}" } }],
      { event: { row: { id: "dev-002" } } },
    );
    expect(state.screen).toEqual({ id: "deviceSettings", params: { deviceId: "dev-002" } });
    // mount: 下書きを state に用意する
    expect(state.state.draftSettings).toEqual(find(state, "deviceSettings", "deviceId", "dev-002"));
    expect(state.state.draftSettings).not.toBe(
      find(state, "deviceSettings", "deviceId", "dev-002"),
    );
    expect(log.map((l) => [l.action.type, l.ok])).toEqual([
      ["navigate", true],
      ["mount", true],
      ["setState", true],
    ]);
  });

  it("closes open dialogs and fails for an unknown screen", () => {
    let rt = run(start(), [
      { type: "openDialog", dialog: "alarmDetail", params: { alarmId: "alm-001" } },
    ]).state;
    rt = run(rt, [{ type: "navigate", to: "devices" }]).state;
    expect(rt.dialogs).toEqual([]);
    const { state, log } = run(rt, [{ type: "navigate", to: "nowhere" }]);
    expect(state).toBe(rt);
    expect(log).toEqual([
      {
        action: { type: "navigate", to: "nowhere" },
        ok: false,
        message: "画面 nowhere がありません",
      },
    ]);
  });
});

describe("openDialog / closeDialog", () => {
  it("stacks dialogs and closes the top one", () => {
    let rt = run(
      start(),
      [
        { type: "openDialog", dialog: "alarmDetail", params: { alarmId: "{{ alarm.id }}" } },
        { type: "openDialog", dialog: "saveConfirm", params: { deviceId: "dev-001" } },
      ],
      { locals: { alarm: { id: "alm-003" } } },
    ).state;
    expect(rt.dialogs).toEqual([
      { id: "alarmDetail", params: { alarmId: "alm-003" } },
      { id: "saveConfirm", params: { deviceId: "dev-001" } },
    ]);
    rt = run(rt, [{ type: "closeDialog" }]).state;
    expect(rt.dialogs.map((d) => d.id)).toEqual(["alarmDetail"]);
    rt = run(rt, [{ type: "closeDialog" }]).state;
    expect(run(rt, [{ type: "closeDialog" }]).log[0]).toMatchObject({
      ok: false,
      message: "開いているダイアログがありません",
    });
  });
});

describe("setState", () => {
  it("sets a nested path immutably", () => {
    const rt = run(start(), [
      { type: "navigate", to: "deviceSettings", params: { deviceId: "dev-001" } },
    ]).state;
    const before = rt.state.draftSettings as Rec;
    const next = run(
      rt,
      [{ type: "setState", path: "draftSettings.network.ip", value: "{{ event.value }}" }],
      {
        event: { value: "10.0.0.1" },
      },
    ).state;
    expect((next.state.draftSettings as { network: Rec }).network.ip).toBe("10.0.0.1");
    expect((before.network as Rec).ip).toBe("192.168.10.1");
    // 元のデータは変わらない
    expect((find(next, "deviceSettings", "deviceId", "dev-001").network as Rec).ip).toBe(
      "192.168.10.1",
    );
  });

  it("fails when a parent is null", () => {
    const { log } = run(start(), [
      { type: "setState", path: "draftSettings.network.ip", value: "x" },
    ]);
    expect(log[0]).toMatchObject({
      ok: false,
      message: "state.draftSettings が null なので state.draftSettings.network.ip を設定できません",
    });
  });

  it("sets top-level values", () => {
    expect(setPath({ a: 1 }, ["b"], 2)).toEqual({ ok: true, value: { a: 1, b: 2 } });
  });
});

describe("updateData", () => {
  it("overwrites fields of matching records", () => {
    const { state, log } = run(
      start(),
      [
        {
          type: "updateData",
          collection: "alarms",
          match: { id: "{{ params.alarmId }}" },
          set: { acknowledged: true },
        },
      ],
      { params: { alarmId: "alm-002" } },
    );
    expect(find(state, "alarms", "id", "alm-002").acknowledged).toBe(true);
    expect(find(start(), "alarms", "id", "alm-002").acknowledged).toBe(false);
    expect(log[0]).toMatchObject({
      ok: true,
      message: 'alarms の 1 件を更新: {"acknowledged":true}',
    });
  });

  it("fails when nothing matches or the collection is unknown", () => {
    const rt = start();
    expect(
      run(rt, [{ type: "updateData", collection: "alarms", match: { id: "none" }, set: {} }]).log[0]
        ?.ok,
    ).toBe(false);
    expect(
      run(rt, [{ type: "updateData", collection: "nope", match: {}, set: {} }]).log[0]?.message,
    ).toBe("コレクション nope がありません");
  });
});

describe("action chains", () => {
  it("S3 save → D1 OK updates the settings, closes the dialog and goes to S2", () => {
    let rt = run(start(), [
      { type: "navigate", to: "deviceSettings", params: { deviceId: "dev-003" } },
    ]).state;
    rt = run(rt, [
      { type: "setState", path: "draftSettings.network.ip", value: "10.1.2.3" },
      { type: "setState", path: "draftSettings.pollingIntervalSec", value: 120 },
    ]).state;
    // S3 の保存ボタン
    const save = project.screens.find((s) => s.id === "deviceSettings")!;
    const saveButton = findNode(save.root, "save");
    rt = run(rt, saveButton.events!.click!, { params: rt.screen.params }).state;
    expect(rt.dialogs).toEqual([{ id: "saveConfirm", params: { deviceId: "dev-003" } }]);

    // D1 の OK: updateData → updateData → closeDialog → navigate。params はダイアログのもの
    const ok = findNode(project.dialogs!.find((d) => d.id === "saveConfirm")!.root, "ok");
    const { state, log } = run(rt, ok.events!.click!, { params: rt.dialogs.at(-1)!.params });
    expect(log.every((l) => l.ok)).toBe(true);
    expect(log.map((l) => l.action.type)).toEqual([
      "updateData",
      "updateData",
      "closeDialog",
      "navigate",
    ]);
    expect(find(state, "deviceSettings", "deviceId", "dev-003")).toMatchObject({
      network: { ip: "10.1.2.3" },
      pollingIntervalSec: 120,
    });
    expect(find(state, "devices", "id", "dev-003").ipAddress).toBe("10.1.2.3");
    expect(state.dialogs).toEqual([]);
    expect(state.screen.id).toBe("devices");
  });

  it("S1 alarm → D2 acknowledge marks it acknowledged and closes the dialog", () => {
    const dashboard = project.screens.find((s) => s.id === "dashboard")!;
    let rt = run(start(), findNode(dashboard.root, "alarmRow").events!.click!, {
      locals: { alarm: { id: "alm-001" } },
    }).state;
    expect(rt.dialogs).toEqual([{ id: "alarmDetail", params: { alarmId: "alm-001" } }]);
    const ack = findNode(project.dialogs!.find((d) => d.id === "alarmDetail")!.root, "acknowledge");
    rt = run(rt, ack.events!.click!, { params: rt.dialogs.at(-1)!.params }).state;
    expect(find(rt, "alarms", "id", "alm-001").acknowledged).toBe(true);
    expect(rt.dialogs).toEqual([]);
  });

  it("stops at the first failure", () => {
    const { state, log } = run(start(), [
      { type: "openDialog", dialog: "alarmDetail", params: { alarmId: "{{ nope }}" } },
      { type: "navigate", to: "devices" },
    ]);
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({ ok: false, message: "{{ nope }}: nope は定義されていません" });
    expect(state.screen.id).toBe("dashboard");
  });

  it("does not let expressions mutate the store", () => {
    const rt = start();
    const { log } = run(rt, [
      { type: "setState", path: "draftSettings", value: "{{ data.devices.sort() }}" },
    ]);
    expect(log[0]?.ok).toBe(false);
    expect(rt.data.devices).toEqual(project.sampleData.devices);
    expect(freeze({ a: { b: 1 } }).a).toSatisfy(Object.isFrozen);
  });
});

function findNode(
  root: Project["screens"][number]["root"],
  id: string,
): Project["screens"][number]["root"] {
  if (root.id === id) return root;
  for (const c of root.children ?? []) {
    try {
      return findNode(c, id);
    } catch {
      // 次の子へ
    }
  }
  throw new Error(`node ${id} not found`);
}
