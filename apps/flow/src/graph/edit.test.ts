import { loadProject, serializeProject, validateProject, type Project } from "@ui-editor/schema";
import { describe, expect, it } from "vitest";
import {
  addTransition,
  isConnectablePart,
  moveTransitionToEvent,
  removeTransitions,
  setTransitionParams,
} from "./edit";
import { extractFlow, type Transition } from "./extract";
import { loadExample } from "./example.test-util";

function pairs(project: Project): string[] {
  return extractFlow(project)
    .transitions.map((t) => `${t.source} -> ${t.target}`)
    .sort();
}

function byId(project: Project, id: string): Transition {
  const t = extractFlow(project).transitions.find((x) => x.id === id);
  if (!t) throw new Error(`遷移 ${id} がありません`);
  return t;
}

/** P0 形式で書き出して読み戻し、検証を通ることを確かめる。 */
function roundTrip(project: Project, format: "json" | "yaml"): Project {
  const result = loadProject(serializeProject(project, format), format);
  if (!result.success) throw new Error(JSON.stringify(result.issues));
  return result.project;
}

describe("遷移の追加", () => {
  const example = loadExample();

  it("ボタンから画面へ: click に navigate を足す", () => {
    const { project, id } = addTransition(
      example,
      { ownerKind: "dialog", ownerId: "alarmDetail", nodeId: "close" },
      { kind: "screen", id: "devices" },
    );
    expect(id).toBe("dialog:alarmDetail/close#click[1]");
    const close = project.dialogs![1]!.root.children!.at(-1)!.children![0]!;
    expect(close.events).toEqual({
      click: [{ type: "closeDialog" }, { type: "navigate", to: "devices" }],
    });
    expect(pairs(project)).toContain("alarmDetail -> devices");
    // 元のプロジェクトは変わらない
    expect(pairs(example)).not.toContain("alarmDetail -> devices");
    expect(validateProject(project).success).toBe(true);
  });

  it("イベントの無いパーツに足すと events を作る。テーブルは rowClick", () => {
    const noEvents: Project = structuredClone(example);
    delete noEvents.screens[1]!.root.children![1]!.events;
    const { project, id } = addTransition(
      noEvents,
      { ownerKind: "screen", ownerId: "devices", nodeId: "deviceTable" },
      { kind: "dialog", id: "alarmDetail" },
    );
    expect(id).toBe("screen:devices/deviceTable#rowClick[0]");
    expect(project.screens[1]!.root.children![1]!.events).toEqual({
      rowClick: [{ type: "openDialog", dialog: "alarmDetail", params: { alarmId: "" } }],
    });
  });

  it("遷移先の必須 params は、遷移元に同じ名前があれば引き継ぐ", () => {
    const { project, id } = addTransition(
      example,
      { ownerKind: "screen", ownerId: "deviceSettings", nodeId: "cancel" },
      { kind: "dialog", id: "saveConfirm" },
    );
    expect(byId(project, id).kind).toBe("openDialog");
    const cancel = project.screens[2]!.root.children![2]!.children!.at(-1)!.children![0]!;
    expect(cancel.events!.click!.at(-1)).toEqual({
      type: "openDialog",
      dialog: "saveConfirm",
      params: { deviceId: "{{ params.deviceId }}" },
    });
    expect(validateProject(project).success).toBe(true);
  });

  it("遷移を引き出せるパーツ", () => {
    expect(isConnectablePart({ id: "a", type: "Button" })).toBe(true);
    expect(isConnectablePart({ id: "a", type: "AlarmRow" })).toBe(true);
    expect(isConnectablePart({ id: "a", type: "Box", style: { cursor: "pointer" } })).toBe(true);
    expect(isConnectablePart({ id: "a", type: "Box" })).toBe(false);
    expect(isConnectablePart({ id: "a", type: "Text" })).toBe(false);
  });
});

describe("遷移の削除", () => {
  const example = loadExample();

  it("アクションを消し、空になったイベント・events も消す", () => {
    const t = byId(example, "screen:dashboard/toDevices#click[0]");
    const project = removeTransitions(example, [t.trigger]);
    expect(pairs(project)).not.toContain("dashboard -> devices");
    expect(extractFlow(project).transitions).toHaveLength(7);
    const header = project.screens[0]!.root.children![0]!;
    expect(header.children![1]).toEqual({
      id: "toDevices",
      type: "Button",
      props: { label: "機器一覧へ", variant: "secondary" },
    });
  });

  it("同じイベントの他のアクションは残す", () => {
    const t = byId(example, "dialog:saveConfirm/ok#click[3]");
    const project = removeTransitions(example, [t.trigger]);
    const ok = project.dialogs![0]!.root.children![1]!.children![1]!;
    expect(ok.events!.click!.map((a) => a.type)).toEqual([
      "updateData",
      "updateData",
      "closeDialog",
    ]);
  });

  it("同じイベントの遷移をまとめて消しても番号がずれない", () => {
    let project = example;
    const src = { ownerKind: "screen", ownerId: "devices", nodeId: "toDashboard" } as const;
    project = addTransition(project, src, { kind: "screen", id: "deviceSettings" }).project;
    project = addTransition(project, src, { kind: "dialog", id: "alarmDetail" }).project;
    const ts = extractFlow(project).transitions.filter((t) => t.trigger.nodeId === "toDashboard");
    expect(ts.map((t) => t.target)).toEqual(["dashboard", "deviceSettings", "alarmDetail"]);
    const removed = removeTransitions(project, [ts[0]!.trigger, ts[2]!.trigger]);
    const left = extractFlow(removed).transitions.filter((t) => t.trigger.nodeId === "toDashboard");
    expect(left.map((t) => t.target)).toEqual(["deviceSettings"]);
  });

  it("遷移でないアクションを指したら失敗する", () => {
    const t = byId(example, "dialog:saveConfirm/ok#click[3]");
    expect(() => removeTransitions(example, [{ ...t.trigger, actionIndex: 0 }])).toThrow();
  });

  it("コンポーネント内の遷移はコンポーネントの定義から消す", () => {
    const project: Project = {
      ...example,
      components: example.components!.map((c) =>
        c.id === "StatusBadge"
          ? { ...c, root: { ...c.root, events: { click: [{ type: "navigate", to: "devices" }] } } }
          : c,
      ),
    };
    const inComponent = extractFlow(project).transitions.filter((t) => t.trigger.component);
    // StatusBadge は S1（機器カード）と S3（ヘッダー）に置かれている
    expect(inComponent.map((t) => t.id).sort()).toEqual([
      "screen:dashboard/deviceStatus>StatusBadge.badge#click[0]",
      "screen:deviceSettings/status>StatusBadge.badge#click[0]",
    ]);
    const removed = removeTransitions(project, [inComponent[0]!.trigger]);
    expect(extractFlow(removed).transitions.filter((t) => t.trigger.component)).toEqual([]);
    expect(removed.components!.find((c) => c.id === "StatusBadge")!.root.events).toBeUndefined();
  });
});

describe("遷移の編集", () => {
  const example = loadExample();

  it("params を置き換える・空なら消す", () => {
    const t = byId(example, "screen:dashboard/alarmRow#click[0]");
    const p1 = setTransitionParams(example, t.trigger, { alarmId: "a-1" });
    expect(p1.screens[0]!.root.children![3]!.children![1]!.events!.click![0]).toEqual({
      type: "openDialog",
      dialog: "alarmDetail",
      params: { alarmId: "a-1" },
    });
    const p2 = setTransitionParams(example, t.trigger, {});
    expect(p2.screens[0]!.root.children![3]!.children![1]!.events!.click![0]).toEqual({
      type: "openDialog",
      dialog: "alarmDetail",
    });
  });

  it("別のイベントに付け替える", () => {
    const t = byId(example, "screen:devices/toDashboard#click[0]");
    const { project, id } = moveTransitionToEvent(example, t.trigger, "doubleClick");
    expect(id).toBe("screen:devices/toDashboard#doubleClick[0]");
    expect(project.screens[1]!.root.children![0]!.children![1]!.events).toEqual({
      doubleClick: [{ type: "navigate", to: "dashboard" }],
    });
  });
});

describe("P0 形式で保存", () => {
  it("追加・削除した結果を JSON / YAML で書き出して読み戻せる", () => {
    const example = loadExample();
    let project = removeTransitions(example, [
      byId(example, "screen:devices/toDashboard#click[0]").trigger,
    ]);
    project = addTransition(
      project,
      { ownerKind: "dialog", ownerId: "alarmDetail", nodeId: "close" },
      { kind: "screen", id: "dashboard" },
    ).project;
    for (const format of ["json", "yaml"] as const) {
      const back = roundTrip(project, format);
      expect(back).toEqual(project);
      expect(pairs(back)).toContain("alarmDetail -> dashboard");
      expect(pairs(back)).not.toContain("devices -> dashboard");
    }
  });

  it("編集しなければ題材ファイルと同じテキストになる", () => {
    const example = loadExample();
    const removed = removeTransitions(example, [
      byId(example, "screen:devices/toDashboard#click[0]").trigger,
    ]);
    const restored = addTransition(
      removed,
      { ownerKind: "screen", ownerId: "devices", nodeId: "toDashboard" },
      { kind: "screen", id: "dashboard" },
    ).project;
    expect(serializeProject(restored, "yaml")).toBe(serializeProject(example, "yaml"));
  });
});
