import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { migrate, type Data } from "@puckeditor/core";
import { loadProject, serializeProject, type Node, type Project } from "@ui-editor/schema";
import { describe, expect, it } from "vitest";
import { createConfig } from "../puck/config.tsx";
import { nodeToPuck, puckToNode, puckToTree, treeToPuck, type PuckItem } from "./convert.ts";

const examplePath = fileURLToPath(
  new URL("../../../../packages/schema/examples/device-monitor.project.yaml", import.meta.url),
);
const exampleText = readFileSync(examplePath, "utf8");

function loadExample(): Project {
  const result = loadProject(exampleText, "yaml");
  if (!result.success) throw new Error("題材ファイルを読めません");
  return result.project;
}

/** プロジェクトのすべてのツリーを Puck 経由で変換し直す。 */
function roundTrip(project: Project, through: (data: Data) => Data): Project {
  const tree = (root: Node) => {
    const result = puckToTree(through(treeToPuck(root)));
    if (!result.ok) throw new Error(result.message);
    return result.root;
  };
  return {
    ...project,
    screens: project.screens.map((s) => ({ ...s, root: tree(s.root) })),
    dialogs: project.dialogs?.map((d) => ({ ...d, root: tree(d.root) })),
    components: project.components?.map((c) => ({ ...c, root: tree(c.root) })),
  };
}

describe("P0 ⇔ Puck の変換", () => {
  it("題材ファイルを Puck のデータにして戻すと、書き出したテキストが元と一致する", () => {
    const project = loadExample();
    const back = roundTrip(project, (data) => data);
    expect(serializeProject(back, "yaml")).toBe(exampleText);
  });

  it("Puck の migrate（読み込み時の正規化）を通しても一致する", () => {
    const project = loadExample();
    const back = roundTrip(project, (data) => migrate(data, createConfig(project.components)));
    expect(serializeProject(back, "yaml")).toBe(exampleText);
  });

  it("repeat / visible / events は _p0 に退避され、Puck の欄の props は平らになる", () => {
    const item = nodeToPuck({
      id: "row",
      type: "Box",
      repeat: { each: "{{ data.devices }}", as: "device" },
      visible: "{{ device.status !== 'offline' }}",
      events: { click: [{ type: "navigate", to: "devices" }] },
      style: { display: "flex" },
      children: [{ id: "name", type: "Text", props: { text: "{{ device.name }}" } }],
    });
    expect(item.props).toMatchObject({
      id: "row",
      style: { display: "flex" },
      children: [{ type: "Text", props: { id: "name", text: "{{ device.name }}" } }],
      _p0: { repeat: { as: "device" }, events: { click: [{ type: "navigate" }] } },
    });
  });

  it("予約語と同じ名前の props や、slot の無い type の children も保たれる", () => {
    const node: Node = {
      id: "t",
      type: "Text",
      props: { text: "a", style: "x", id: "y" },
      children: [{ id: "c", type: "Text" }],
    };
    expect(puckToNode(nodeToPuck(node))).toEqual(node);
  });

  it("Puck で消した（undefined にした）props・style のキーは書き出さない", () => {
    const item: PuckItem = {
      type: "Box",
      props: {
        id: "b",
        label: undefined,
        style: { width: undefined, gap: 8 },
        children: [],
      },
    };
    expect(puckToNode(item)).toEqual({ id: "b", type: "Box", style: { gap: 8 } });
    const empty: PuckItem = { type: "Text", props: { id: "t", style: { width: undefined } } };
    expect(puckToNode(empty)).toEqual({ id: "t", type: "Text" });
  });

  it("id が root のノードは Puck の root と衝突しないよう別名にし、戻すときに元に戻す", () => {
    const node: Node = { id: "root", type: "Box", children: [{ id: "a", type: "Text" }] };
    const data = treeToPuck(node);
    expect((data.root.props as Record<string, unknown>).nodeId).not.toBe("root");
    expect(puckToTree(data)).toEqual({ ok: true, root: node });
  });

  it("root が Box のツリーは Puck の root に対応させ、子を root の slot に入れる", () => {
    const node: Node = {
      id: "page",
      type: "Box",
      style: { gap: 8 },
      children: [{ id: "a", type: "Text" }],
    };
    const data = treeToPuck(node);
    expect(data.content).toEqual([]);
    expect(data.root.props).toMatchObject({
      nodeId: "page",
      style: { gap: 8 },
      items: [{ type: "Text" }],
    });
    expect(puckToTree(data)).toEqual({ ok: true, root: node });
  });

  it("root が Box でないツリーで、一番外のパーツが 1 つでなければエラー", () => {
    expect(puckToTree({ root: { props: {} }, content: [] }).ok).toBe(false);
    const two = {
      root: { props: {} },
      content: [nodeToPuck({ id: "a", type: "Text" }), nodeToPuck({ id: "b", type: "Text" })],
    };
    expect(puckToTree(two)).toMatchObject({ ok: false });
  });

  it("Puck が新しく振る id（`Text-<uuid>`）は P0 の id として通る", () => {
    const project = loadExample();
    const root = project.screens[0]!.root;
    const id = "Text-3f0c2a8e-1b7d-4c55-9a51-0d2e6f7a8b9c";
    const edited = { ...root, children: [...(root.children ?? []), { id, type: "Text" }] };
    const next = {
      ...project,
      screens: project.screens.map((s, i) => (i === 0 ? { ...s, root: edited } : s)),
    };
    const result = loadProject(serializeProject(next, "json"), "json");
    expect(result.success ? [] : result.issues).toEqual([]);
  });
});
