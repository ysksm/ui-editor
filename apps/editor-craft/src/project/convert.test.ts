import { readFileSync } from "node:fs";
import { loadProject, serializeProject, type Node, type Project } from "@ui-editor/schema";
import { describe, expect, it } from "vitest";
import { craftToP0, INSTANCE, p0ToCraft, ROOT_ID } from "./convert";
import { listDocs, replaceDocRoot } from "./documents";

const exampleText = readFileSync(
  new URL("../../../../packages/schema/examples/device-monitor.project.json", import.meta.url),
  "utf8",
);

function loadExample(): Project {
  const result = loadProject(exampleText, "json");
  if (!result.success) throw new Error("題材ファイルが読めません");
  return result.project;
}

describe("p0ToCraft / craftToP0", () => {
  const tree: Node = {
    id: "page",
    type: "Box",
    style: { display: "flex", gap: 8 },
    children: [
      { id: "title", type: "Text", props: { text: "見出し", variant: "title" } },
      { id: "badge", type: "StatusBadge", props: { status: "online" } },
      { id: "empty", type: "Box", children: [] },
    ],
  };

  it("ルートは ROOT、それ以外は P0 の id を Craft の id にする", () => {
    const craft = p0ToCraft(tree);
    expect(Object.keys(craft).sort()).toEqual([ROOT_ID, "badge", "empty", "title"]);
    expect(craft[ROOT_ID]?.nodes).toEqual(["title", "badge", "empty"]);
    expect(craft[ROOT_ID]?.isCanvas).toBe(true);
    expect(craft.title?.parent).toBe(ROOT_ID);
  });

  it("コンポーネントのインスタンスは ComponentInstance にしてコンポーネント id を props に持つ", () => {
    const badge = p0ToCraft(tree).badge!;
    expect(badge.type).toEqual({ resolvedName: INSTANCE });
    expect(badge.props).toEqual({
      component: "StatusBadge",
      nodeId: "badge",
      props: { status: "online" },
    });
  });

  it("戻すと元のツリーになる", () => {
    expect(craftToP0(p0ToCraft(tree))).toEqual(tree);
  });

  it("id が無い・重複しているノードに id を付ける", () => {
    const craft = p0ToCraft(tree);
    craft.new1 = { ...craft.title!, props: { props: { text: "a" } } };
    craft.new2 = { ...craft.title!, props: { nodeId: "title", props: { text: "b" } } };
    craft[ROOT_ID]!.nodes.push("new1", "new2");
    const ids = craftToP0(craft).children?.map((c) => c.id);
    expect(ids).toEqual(["title", "badge", "empty", "text1", "text2"]);
  });

  it("題材ファイルの全ドキュメントが変換で変わらない", () => {
    const project = loadExample();
    let converted = project;
    for (const doc of listDocs(project)) {
      converted = replaceDocRoot(converted, doc.key, craftToP0(p0ToCraft(doc.root)));
    }
    expect(serializeProject(converted, "json")).toBe(serializeProject(project, "json"));
  });
});
