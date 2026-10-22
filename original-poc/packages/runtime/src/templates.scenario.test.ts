import { listRecords } from "@ui-editor/poc-datastore";
import {
  addContainer,
  addTransition,
  applyTemplate,
  checkProject,
  containers,
  formatIssue,
  loadProject,
  setTransitionParams,
  setTrigger,
  walkNodes,
  type Node,
  type Project,
} from "@ui-editor/poc-model";
import { produce } from "immer";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { currentFrame, fireEvent, start } from "./engine.js";
import { scopeFor } from "./scope.js";
import type { RuntimeState } from "./types.js";

/**
 * 手書きの中身が無いプロジェクト（題材の ER とデータ ＋ 画面・ダイアログと遷移）を、
 * テンプレート（applyTemplate）とトリガーの変更（setTrigger）だけで組み立て、ランタイムで CRUD が動くかを確かめる。
 */
function templateProject(): Project {
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
    for (const [kind, id, name] of [
      ["screen", "dashboard", "ダッシュボード"],
      ["screen", "devices", "機器一覧"],
      ["screen", "deviceDetail", "機器詳細"],
      ["dialog", "deviceEdit", "機器の編集"],
      ["dialog", "deviceDelete", "削除の確認"],
    ] as const)
      addContainer(d, kind, { id, name });
    addTransition(d, "dashboard", "devices");
    const toEdit = addTransition(d, "devices", "deviceEdit");
    const toDetail = addTransition(d, "devices", "deviceDetail");
    const toDelete = addTransition(d, "deviceDetail", "deviceDelete");
    const backToList = addTransition(d, "deviceDelete", "devices");
    addTransition(d, "deviceDetail", "devices");
    applyTemplate(d, "devices", { kind: "list", entity: "Device" });
    applyTemplate(d, "deviceDetail", { kind: "detail", entity: "Device" });
    applyTemplate(d, "deviceEdit", { kind: "form", entity: "Device" });
    applyTemplate(d, "deviceDelete", { kind: "confirm", entity: "Device" });
    setTrigger(d, toDetail, { kind: "rowClick", node: "table" });
    setTrigger(d, toEdit, { kind: "selectButton", table: "table", entity: "Device" });
    setTransitionParams(d, toDelete, { deviceId: "{{ params.deviceId }}" });
    // 削除の確認の「機器一覧へ」（仮のボタン）を、テンプレートの OK ボタンに移す
    setTrigger(d, backToList, { kind: "button", node: "ok" });
  });
}

/** 文言（ボタンの label・Text の text）で部品の id を探す。 */
function nodeByLabel(p: Project, container: string, label: string): string {
  const root = containers(p).find((c) => c.container.id === container)!.container.root!;
  let found: Node | undefined;
  walkNodes(root, [], (n) => (found ??= n.props?.label === label ? n : undefined));
  if (!found) throw new Error(`${container} に「${label}」がありません`);
  return found.id;
}

const top = (rt: RuntimeState) => currentFrame(rt)!;
const fire = (p: Project, rt: RuntimeState, node: string, event = "click", payload?: unknown) =>
  fireEvent(p, rt, { frameId: top(rt).id, node, event, payload });
const device = (rt: RuntimeState, id: string) => rt.data.Device!.find((d) => d.id === id)!;

describe("テンプレートだけで作ったプロジェクトのランタイム", () => {
  const p = templateProject();

  it("検証のエラーが無い（警告は仮のボタンのままの遷移だけ）", () => {
    const issues = checkProject(p);
    expect(issues.filter((i) => i.severity === "error").map(formatIssue)).toEqual([]);
    expect(issues.every((i) => /仮の部品/.test(i.message))).toBe(true);
  });

  it("機器を選んで編集・保存すると一覧に反映される", () => {
    let rt = start(p);
    rt = fire(p, rt, nodeByLabel(p, "dashboard", "機器一覧へ"));
    expect(top(rt).container).toBe("devices");
    const edit = nodeByLabel(p, "devices", "機器の編集を開く");
    rt = fire(p, rt, "table", "rowSelect", { row: device(rt, "dev-003") });
    rt = fire(p, rt, edit);
    expect(top(rt)).toMatchObject({ container: "deviceEdit", params: { deviceId: "dev-003" } });
    rt = fire(p, rt, "nameInput", "change", { value: "エッジルーター 改" });
    rt = fire(p, rt, "save");
    expect(rt.dialogs).toEqual([]);
    expect(top(rt).container).toBe("devices");
    // 一覧の表の行（data.Device）に反映される
    const rows = scopeFor(p, rt, top(rt)).data as { Device: { name: string }[] };
    expect(rows.Device.map((d) => d.name)).toContain("エッジルーター 改");
  });

  it("機器を削除すると、その機器のアラームも消える（cascade）", () => {
    let rt = start(p);
    rt = fire(p, rt, nodeByLabel(p, "dashboard", "機器一覧へ"));
    rt = fire(p, rt, "table", "rowClick", { row: device(rt, "dev-003") });
    expect(top(rt)).toMatchObject({ container: "deviceDetail", params: { deviceId: "dev-003" } });
    expect(scopeFor(p, rt, top(rt)).record).toMatchObject({ name: "エッジルーター 1F" });
    const alarmsBefore = listRecords(p, rt.data, "Alarm").length;
    rt = fire(p, rt, nodeByLabel(p, "deviceDetail", "削除の確認を開く"));
    expect(top(rt)).toMatchObject({ container: "deviceDelete", params: { deviceId: "dev-003" } });
    rt = fire(p, rt, "ok");
    expect(rt.dialogs).toEqual([]);
    expect(top(rt).container).toBe("devices");
    expect(rt.data.Device!.map((d) => d.id)).not.toContain("dev-003");
    expect(listRecords(p, rt.data, "Alarm")).toHaveLength(alarmsBefore - 2);
  });
});
