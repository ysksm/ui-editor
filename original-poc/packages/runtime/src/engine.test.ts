import { listRecords } from "@ui-editor/poc-datastore";
import {
  extractTransitions,
  loadProject,
  type DataRecord,
  type Project,
} from "@ui-editor/poc-model";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  back,
  currentFrame,
  currentScreen,
  fireEvent,
  resetData,
  start,
  startAt,
} from "./engine.js";
import { requiresSatisfied, scopeFor } from "./scope.js";
import type { RuntimeState } from "./types.js";

function example(): Project {
  const r = loadProject(
    readFileSync(new URL("../../../examples/device-monitor.poc.json", import.meta.url), "utf8"),
  );
  if (!r.success) throw new Error("題材");
  return r.project;
}

const device = (p: Project, id: string) => p.data.Device!.find((d) => d.id === id)!;
const top = (rt: RuntimeState) => currentFrame(rt)!;
const click = (p: Project, rt: RuntimeState, node: string, event = "click", payload?: unknown) =>
  fireEvent(p, rt, { frameId: top(rt).id, node, event, payload });
const lastLog = (rt: RuntimeState) => rt.log.at(-1)!;

describe("画面の遷移とダイアログ（題材）", () => {
  const p = example();

  it("最初の画面から、ボタン・行クリックで辿る。履歴に同じ画面があればそこまで戻す", () => {
    let rt = start(p);
    expect(top(rt).container).toBe("dashboard");
    rt = click(p, rt, "toDevices");
    expect(top(rt).container).toBe("devices");
    rt = click(p, rt, "table", "rowClick", { row: device(p, "dev-002") });
    expect(top(rt)).toMatchObject({ container: "deviceDetail", params: { deviceId: "dev-002" } });
    expect(scopeFor(p, rt, top(rt)).record).toMatchObject({ name: "コアスイッチ B" });
    rt = click(p, rt, "back");
    expect(rt.history.map((f) => f.container)).toEqual(["dashboard", "devices"]);
    // たどった遷移の key はフロー図の線の key と同じ
    const keys = new Set(extractTransitions(p).map((t) => t.key));
    expect(rt.trail.map((t) => t.key)).toEqual([
      "dashboard:toDevices:click:0",
      "devices:table:rowClick:0",
      "deviceDetail:back:click:0",
    ]);
    expect(rt.trail.every((t) => keys.has(t.key))).toBe(true);
  });

  it("削除の確認 → 削除（入れ子の子も）→ 閉じる → 一覧へ", () => {
    let rt = start(p);
    rt = click(p, rt, "toDevices");
    rt = click(p, rt, "table", "rowClick", { row: device(p, "dev-001") });
    rt = click(p, rt, "delete");
    expect(top(rt)).toMatchObject({
      container: "deviceDelete",
      kind: "dialog",
      params: { deviceId: "dev-001" },
    });
    expect(currentScreen(rt)!.container).toBe("deviceDetail");
    rt = click(p, rt, "ok");
    expect(rt.dialogs).toEqual([]);
    expect(rt.history.map((f) => f.container)).toEqual(["dashboard", "devices"]);
    expect(rt.data.Device!.map((d) => d.id)).not.toContain("dev-001");
    expect(listRecords(p, rt.data, "Alarm")).toHaveLength(8);
    expect(
      rt.log.some(
        (l) =>
          l.message === "機器 dev-001 を削除（機器設定 1 件、メトリクス 3 件、アラーム 2 件も）",
      ),
    ).toBe(true);
    // 元のサンプルデータは変わらない
    expect(p.data.Device).toHaveLength(5);
    expect(resetData(p, rt).data).toBe(p.data);
  });

  it("選択＋ボタン（T3）: 未選択なら requires を満たさない。選ぶと編集ダイアログに下書きができる", () => {
    let rt = click(p, start(p), "toDevices");
    expect(requiresSatisfied(p, rt, "selection.Device")).toBe(false);
    rt = click(p, rt, "table", "rowSelect", { row: device(p, "dev-003") });
    expect(rt.selection).toEqual({ Device: "dev-003" });
    expect(requiresSatisfied(p, rt, "selection.Device")).toBe(true);
    rt = click(p, rt, "edit");
    expect(top(rt)).toMatchObject({ container: "deviceEdit", params: { deviceId: "dev-003" } });
    expect(top(rt).draft).toMatchObject({
      id: "dev-003",
      name: "エッジルーター 1F",
      status: "warning",
    });
  });

  it("フォーム: 下書きを直して保存。検証エラーなら閉じずに項目ごとのエラーを出す", () => {
    let rt = click(p, start(p), "toDevices");
    rt = click(p, rt, "table", "rowSelect", { row: device(p, "dev-003") });
    rt = click(p, rt, "edit");
    rt = click(p, rt, "name", "change", { value: "" });
    rt = click(p, rt, "save");
    expect(top(rt).container).toBe("deviceEdit");
    expect(top(rt).errors).toEqual({ name: "必須の項目です" });
    expect(scopeFor(p, rt, top(rt)).errors).toEqual({ name: "必須の項目です" });
    expect(lastLog(rt).level).toBe("error");
    rt = click(p, rt, "name", "change", { value: "エッジルーター 改" });
    expect(top(rt).errors).toEqual({});
    rt = click(p, rt, "status", "change", { value: "online" });
    rt = click(p, rt, "save");
    expect(rt.dialogs).toEqual([]);
    expect(device({ ...p, data: rt.data }, "dev-003")).toMatchObject({
      name: "エッジルーター 改",
      status: "online",
    });
    // 選択中のレコードは更新後の値が見える
    expect(scopeFor(p, rt, top(rt)).state).toMatchObject({
      selection: { Device: { id: "dev-003", name: "エッジルーター 改" } },
    });
  });

  it("戻る: ダイアログが開いていれば閉じる（cancel）", () => {
    let rt = click(p, start(p), "toDevices");
    rt = click(p, rt, "table", "rowSelect", { row: device(p, "dev-001") });
    rt = click(p, rt, "edit");
    rt = back(p, rt);
    expect(rt.dialogs).toEqual([]);
    expect(lastLog(rt).message).toBe("機器の編集を閉じた（cancel）");
    rt = back(p, rt);
    expect(top(rt).container).toBe("dashboard");
    expect(lastLog(back(p, rt)).message).toBe("これ以上戻れません");
  });
});

describe("onClose・when・mount・失敗", () => {
  /** 一覧・詳細・削除の確認（閉じた結果で呼び出し元が一覧へ戻る）。 */
  function project(): Project {
    const p = example();
    const detail = p.screens.find((s) => s.id === "deviceDetail")!;
    const del = detail.root!.children!.find((n) => n.id === "toolbar")!.children![0]!;
    del.events!.click = [
      {
        type: "openDialog",
        dialog: "deviceDelete",
        params: { deviceId: "{{ params.deviceId }}" },
        onClose: { ok: [{ type: "navigate", to: "devices" }] },
      },
    ];
    const ok = p.dialogs.find((d) => d.id === "deviceDelete")!.root!.children![1]!.children![0]!;
    ok.events!.click = [
      { type: "deleteRecord", entity: "Device", match: { id: "{{ params.deviceId }}" } },
      { type: "closeDialog", result: "ok" },
    ];
    p.state = { visits: 0 };
    p.screens[0]!.events = {
      mount: [
        { type: "setState", path: "visits", value: "{{ state.visits + 1 }}" },
        { type: "navigate", to: "devices", when: "{{ state.visits > 1 }}" },
      ],
    };
    return p;
  }

  it("閉じた結果（ok）で、呼び出し元の onClose を実行する。key は onClose の中の線と同じ", () => {
    const p = project();
    let rt = click(p, start(p), "toDevices");
    rt = click(p, rt, "table", "rowClick", { row: device(p, "dev-002") });
    rt = click(p, rt, "delete");
    rt = click(p, rt, "ok");
    expect(top(rt).container).toBe("devices");
    expect(rt.trail.at(-1)).toEqual({
      key: "deviceDetail:delete:click:0/onClose/ok/0",
      from: "deviceDetail",
      to: "devices",
    });
    expect(
      extractTransitions(p).some((t) => t.key === "deviceDetail:delete:click:0/onClose/ok/0"),
    ).toBe(true);
  });

  it("キャンセルでは onClose（ok）を実行しない", () => {
    const p = project();
    let rt = click(p, start(p), "toDevices");
    rt = click(p, rt, "table", "rowClick", { row: device(p, "dev-002") });
    rt = click(p, rt, "delete");
    rt = click(p, rt, "cancel");
    expect(top(rt).container).toBe("deviceDetail");
  });

  it("mount を実行し、when が偽なら飛ばす", () => {
    const p = project();
    let rt = start(p);
    expect(rt.state).toEqual({ visits: 1 });
    expect(top(rt).container).toBe("dashboard");
    expect(lastLog(rt).message).toBe("navigate は条件（when）を満たさないので飛ばした");
    rt = click(p, rt, "toDevices");
    rt = click(p, rt, "toDashboard");
    // 2 回目の mount では when が真になり、一覧へ移る
    expect(rt.state).toEqual({ visits: 2 });
    expect(top(rt).container).toBe("devices");
  });

  it("失敗したら残りのアクションを実行しない（restrict・式の誤り）", () => {
    const p = project();
    p.entities.push({
      id: "Ticket",
      name: "チケット",
      primaryKey: "id",
      fields: [
        { id: "id", type: "id" },
        { id: "deviceId", type: "ref", entity: "Device" },
      ],
    });
    p.data.Ticket = [{ id: "t-1", deviceId: "dev-002" }];
    let rt = click(p, start(p), "toDevices");
    rt = click(p, rt, "table", "rowClick", { row: device(p, "dev-002") });
    rt = click(p, rt, "delete");
    rt = click(p, rt, "ok");
    expect(top(rt).container).toBe("deviceDelete");
    expect(lastLog(rt)).toMatchObject({
      level: "error",
      message: expect.stringContaining("参照されているため削除できません"),
    });

    const q = project();
    q.screens[0]!.root!.children![3]!.events!.click = [
      { type: "setState", path: "visits", value: "{{ nope.x }}" },
      { type: "navigate", to: "devices" },
    ];
    const r = click(q, start(q), "toDevices");
    expect(top(r).container).toBe("dashboard");
    expect(lastLog(r).message).toMatch(/nope/);
  });
});

describe("入れ子のエンティティを作るフォーム", () => {
  it("親を指す ref パラメータで、親の下に作る", () => {
    const p = example();
    p.dialogs.push({
      id: "alarmNew",
      name: "アラームの追加",
      kind: "form",
      entity: "Alarm",
      params: { deviceId: { type: "ref", entity: "Device", required: true } },
      root: {
        id: "body",
        type: "Box",
        children: [
          {
            id: "message",
            type: "TextInput",
            events: {
              change: [{ type: "setDraft", field: "message", value: "{{ event.value }}" }],
            },
          },
          {
            id: "level",
            type: "Select",
            events: { change: [{ type: "setDraft", field: "level", value: "{{ event.value }}" }] },
          },
          {
            id: "save",
            type: "Button",
            events: { click: [{ type: "saveDraft" }, { type: "closeDialog" }] },
          },
        ],
      },
    });
    const detail = p.screens.find((s) => s.id === "deviceDetail")!;
    detail.root!.children!.push({
      id: "addAlarm",
      type: "Button",
      events: {
        click: [
          { type: "openDialog", dialog: "alarmNew", params: { deviceId: "{{ params.deviceId }}" } },
        ],
      },
    });
    let rt = click(p, start(p), "toDevices");
    rt = click(p, rt, "table", "rowClick", { row: device(p, "dev-004") });
    rt = click(p, rt, "addAlarm");
    expect(top(rt).draft).toEqual({
      level: null,
      message: "",
      occurredAt: "",
      acknowledged: false,
    });
    rt = click(p, rt, "message", "change", { value: "温度が高い" });
    rt = click(p, rt, "level", "change", { value: "warn" });
    rt = click(p, rt, "save");
    expect(top(rt).errors).toMatchObject({ occurredAt: expect.stringContaining("日付") });
    rt = click(p, rt, "message", "change", { value: "温度が高い" });
    rt = fireEvent(p, rt, {
      frameId: top(rt).id,
      node: "message",
      event: "change",
      payload: { value: "温度が高い" },
    });
    // occurredAt を入れる部品が無いので、下書きを直接直してから保存する
    rt = {
      ...rt,
      dialogs: rt.dialogs.map((f) => ({
        ...f,
        draft: { ...f.draft!, occurredAt: "2026-10-23T09:00:00Z" },
      })),
    };
    rt = click(p, rt, "save");
    expect(rt.dialogs).toEqual([]);
    const alarms = rt.data.Device!.find((d) => d.id === "dev-004")!.alarms as DataRecord[];
    expect(alarms.at(-1)).toMatchObject({ id: "alm-011", message: "温度が高い", level: "warn" });
  });
});

describe("startAt", () => {
  it("指定した画面・ダイアログから始める（ダイアログは画面の履歴なしで開く）", () => {
    const p = example();
    const rt = startAt(p, "deviceEdit", { deviceId: "dev-002" });
    expect(rt.history).toEqual([]);
    expect(top(rt)).toMatchObject({
      container: "deviceEdit",
      kind: "dialog",
      draft: { name: "コアスイッチ B" },
    });
    const detail = startAt(p, "deviceDetail", { deviceId: "dev-001" });
    expect(scopeFor(p, detail, top(detail)).record).toMatchObject({ id: "dev-001" });
    expect(startAt(p, "nowhere").log.at(-1)!.level).toBe("error");
  });
});
