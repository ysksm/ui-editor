import { produce } from "immer";
import { describe, expect, it } from "vitest";
import { smallProject } from "../fixture.test-util.js";
import type { Project } from "../schema.js";
import { checkProject } from "../validate.js";
import {
  addContainer,
  containerIdProblem,
  countTransitionsTo,
  deleteContainer,
  renameContainerId,
  setEntry,
  setFlowPosition,
  updateContainer,
} from "./containers.js";

const apply = (p: Project, recipe: (d: Project) => void) => produce(p, recipe);

describe("画面・ダイアログの編集操作", () => {
  it("追加すると連番の id と名前で、中身の無い画面・ダイアログができる", () => {
    const ids: string[] = [];
    const p = apply(smallProject(), (d) => {
      ids.push(
        addContainer(d, "screen"),
        addContainer(d, "dialog", { position: { x: 1.2, y: 3 } }),
      );
      ids.push(addContainer(d, "screen", { id: "settings", name: "設定" }));
    });
    expect(ids).toEqual(["screen1", "dialog1", "settings"]);
    expect(p.screens.slice(2)).toEqual([
      { id: "screen1", name: "画面1" },
      { id: "settings", name: "設定" },
    ]);
    expect(p.dialogs[1]).toEqual({ id: "dialog1", name: "ダイアログ1" });
    expect(p.layout?.flow?.dialog1).toEqual({ x: 1, y: 3 });
    expect(checkProject(p)).toEqual([]);
  });

  it("id は画面とダイアログで共通の名前空間", () => {
    const p = smallProject();
    expect(containerIdProblem(p, "deviceDelete")).toBe('"deviceDelete" は既にあります');
    expect(containerIdProblem(p, "deviceDelete", "deviceDelete")).toBeUndefined();
    expect(containerIdProblem(p, "1st")).toMatch(/英字で始まる/);
    expect(() => apply(p, (d) => void addContainer(d, "screen", { id: "devices" }))).toThrow();
  });

  it("名前と path を変える", () => {
    const p = apply(smallProject(), (d) => {
      updateContainer(d, "devices", { name: "一覧", path: "/list" });
      updateContainer(d, "deviceDetail", { path: undefined });
    });
    expect(p.screens[0]).toMatchObject({ name: "一覧", path: "/list" });
    expect(p.screens[1]!.path).toBeUndefined();
  });

  it("id を変えると、遷移（onClose の中も）・entry・配置も書き換える", () => {
    const p = apply(smallProject(), (d) => {
      renameContainerId(d, "devices", "deviceList");
      renameContainerId(d, "deviceDelete", "confirmDelete");
    });
    expect(p.entry).toBe("deviceList");
    expect(p.layout?.flow).toEqual({ deviceList: { x: 0, y: 0 } });
    const open = p.screens[1]!.root!.children![0]!.events!.click![0]!;
    expect(open).toMatchObject({ type: "openDialog", dialog: "confirmDelete" });
    expect(open.type === "openDialog" && open.onClose?.ok?.[0]).toMatchObject({ to: "deviceList" });
    expect(checkProject(p)).toEqual([]);
  });

  it("消すと、そこへの遷移と、空になった仮の部品も消える", () => {
    const base = smallProject();
    expect(countTransitionsTo(base, "deviceDelete")).toBe(1);
    expect(countTransitionsTo(base, "devices")).toBe(1);
    const p = apply(base, (d) => deleteContainer(d, "deviceDelete"));
    expect(p.dialogs).toEqual([]);
    // 仮のボタン（btn1）は openDialog だけを持っていたので消える
    expect(p.screens[1]!.root!.children).toEqual([]);
    expect(checkProject(p)).toEqual([]);

    const q = apply(base, (d) => deleteContainer(d, "devices"));
    expect(q.entry).toBeUndefined();
    expect(q.layout?.flow).toEqual({});
    // onClose の中の navigate だけが消え、onClose も空なので消える。openDialog は残る
    expect(q.screens[0]!.root!.children![0]!.events!.click).toEqual([
      { type: "openDialog", dialog: "deviceDelete", params: { deviceId: "{{ params.deviceId }}" } },
    ]);
  });

  it("仮の部品でないノードは、イベントが空になっても残す", () => {
    const p = apply(smallProject(), (d) => deleteContainer(d, "deviceDetail"));
    // 表（placeholder でない）の rowClick だけが消える
    expect(p.screens[0]!.root!.children![0]).toEqual({
      id: "table",
      type: "Table",
      props: { rows: "{{ data.Device }}", entity: "Device" },
    });
  });

  it("最初の画面", () => {
    const p = apply(smallProject(), (d) => setEntry(d, "deviceDetail"));
    expect(p.entry).toBe("deviceDetail");
    expect(() => apply(p, (d) => setEntry(d, "deviceDelete"))).toThrow(/ダイアログ/);
    expect(apply(p, (d) => setEntry(d, undefined)).entry).toBeUndefined();
    expect(
      apply(p, (d) => setFlowPosition(d, "devices", { x: 9.6, y: 0 })).layout?.flow?.devices,
    ).toEqual({
      x: 10,
      y: 0,
    });
  });
});
