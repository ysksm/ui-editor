import { produce } from "immer";
import { describe, expect, it } from "vitest";
import { smallProject } from "../fixture.test-util.js";
import type { Project } from "../schema.js";
import { checkProject } from "../validate.js";
import { findNode } from "../walk.js";
import { addContainer } from "./containers.js";
import {
  addNode,
  bindingCandidates,
  moveNode,
  moveNodeInto,
  nodeIdProblem,
  removeNode,
  renameNodeId,
  updateNode,
} from "./nodes.js";

const apply = (p: Project, recipe: (d: Project) => void) => produce(p, recipe);
const childIds = (p: Project, screen: number, id?: string) =>
  (id ? findNode(p.screens[screen]!.root, id) : p.screens[screen]!.root)!.children!.map(
    (n) => n.id,
  );

describe("ノードの編集操作", () => {
  it("部品を足す（root が無ければ Box を作る）。id は種類から連番", () => {
    const ids: string[] = [];
    const p = apply(smallProject(), (d) => {
      addContainer(d, "screen", { id: "home" });
      ids.push(
        addNode(d, "home", "Text"),
        addNode(d, "home", "Button"),
        addNode(d, "home", "Text"),
      );
      ids.push(addNode(d, "home", "Box", { index: 0 }));
      ids.push(addNode(d, "home", "Button", { parent: "box1" }));
    });
    expect(ids).toEqual(["text1", "button1", "text2", "box1", "button2"]);
    expect(childIds(p, 2)).toEqual(["box1", "text1", "button1", "text2"]);
    expect(childIds(p, 2, "box1")).toEqual(["button2"]);
    expect(findNode(p.screens[2]!.root, "button1")).toEqual({
      id: "button1",
      type: "Button",
      props: { label: "ボタン" },
    });
    expect(() => apply(p, (d) => void addNode(d, "home", "Text", { parent: "text1" }))).toThrow(
      "Box だけ",
    );
    expect(checkProject(p).filter((i) => i.severity === "error")).toEqual([]);
  });

  it("並べ替え・別の Box へ移す・消す・id を変える", () => {
    const base = apply(smallProject(), (d) => {
      addNode(d, "devices", "Text");
      addNode(d, "devices", "Box");
    });
    expect(childIds(base, 0)).toEqual(["table", "text1", "box1"]);
    const p = apply(base, (d) => {
      moveNode(d, "devices", "text1", -1);
      moveNodeInto(d, "devices", "table", "box1");
    });
    expect(childIds(p, 0)).toEqual(["text1", "box1"]);
    expect(childIds(p, 0, "box1")).toEqual(["table"]);
    expect(() => apply(p, (d) => moveNodeInto(d, "devices", "box1", "box1"))).toThrow("自分の中");
    const q = apply(p, (d) => {
      renameNodeId(d, "devices", "text1", "heading");
      removeNode(d, "devices", "box1");
    });
    expect(childIds(q, 0)).toEqual(["heading"]);
    expect(nodeIdProblem(q.screens[0]!, "page")).toBe('"page" は既にあります');
    expect(apply(q, (d) => removeNode(d, "devices", "page")).screens[0]!.root).toBeUndefined();
  });

  it("props の一部を変える・visible・イベント・本物の部品にする", () => {
    const p = apply(smallProject(), (d) => {
      d.screens[1]!.root!.children![0]!.placeholder = true;
      updateNode(d, "deviceDetail", "btn1", {
        props: { label: "削除", variant: "danger" },
        visible: "{{ record != null }}",
        placeholder: false,
      });
      updateNode(d, "devices", "table", { props: { entity: undefined }, events: {} });
    });
    expect(findNode(p.screens[1]!.root, "btn1")).toMatchObject({
      props: { label: "削除", variant: "danger" },
      visible: "{{ record != null }}",
    });
    expect(findNode(p.screens[1]!.root, "btn1")!.placeholder).toBeUndefined();
    expect(findNode(p.screens[0]!.root, "table")).toEqual({
      id: "table",
      type: "Table",
      props: { rows: "{{ data.Device }}" },
    });
  });
});

describe("bindingCandidates", () => {
  it("その画面で使える名前の候補", () => {
    const p = smallProject();
    const detail = bindingCandidates(p, "deviceDetail");
    expect(detail).toEqual(
      expect.arrayContaining([
        "{{ record?.name }}",
        "{{ record?.alarms ?? [] }}",
        "{{ params.deviceId }}",
        "{{ data.Device }}",
        "{{ data.Alarm }}",
        "{{ state.keyword }}",
        "{{ state.selection.Device?.name }}",
      ]),
    );
    expect(detail).not.toContain("{{ draft.name }}");
    expect(bindingCandidates(p, "devices", { tableEntity: "Device" })).toEqual(
      expect.arrayContaining(["{{ row.name }}", "{{ row.status }}"]),
    );
  });
});
