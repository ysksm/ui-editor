import { describe, expect, it } from "vitest";
import { loadExample } from "../../example";
import { flowAutoPositions, flowGraph, nextContainerPosition, triggerLabel } from "./graph";

describe("flowGraph", () => {
  const project = loadExample();

  it("画面・ダイアログをノード、遷移を線にする（最初の画面・仮の部品の数）", () => {
    const g = flowGraph(project, []);
    expect(g.nodes.map((n) => [n.id, n.data.kind, n.data.entry, n.data.outgoing])).toEqual([
      ["dashboard", "screen", true, 1],
      ["devices", "screen", false, 3],
      ["deviceDetail", "screen", false, 2],
      ["deviceEdit", "dialog", false, 0],
      ["deviceDelete", "dialog", false, 1],
    ]);
    expect(g.edges.map((e) => [e.source, e.target, e.data.label])).toEqual([
      ["dashboard", "devices", "機器一覧へ"],
      ["devices", "deviceEdit", "編集"],
      ["devices", "dashboard", "ダッシュボードへ"],
      ["devices", "deviceDetail", "行クリック（table）"],
      ["deviceDetail", "deviceDelete", "削除"],
      ["deviceDetail", "devices", "一覧へ戻る"],
      ["deviceDelete", "devices", "削除する"],
    ]);
  });

  it("onClose の中の遷移と mount の説明", () => {
    expect(
      triggerLabel({
        key: "k",
        from: "a",
        fromKind: "screen",
        to: "b",
        kind: "navigate",
        node: "btn1",
        nodeType: "Button",
        event: "click",
        label: "削除",
        placeholder: true,
        onClose: { dialog: "confirm", result: "ok" },
        params: undefined,
        path: [],
      }),
    ).toBe("削除 → confirm を閉じたら（ok）");
  });

  it("位置が無ければ自動配置し、最初の画面が左に来る。新しいノードは下に置く", () => {
    const pos = flowAutoPositions(project);
    expect(pos.dashboard!.x).toBeLessThan(pos.devices!.x);
    expect(pos.devices!.x).toBeLessThan(pos.deviceDetail!.x);
    const next = nextContainerPosition(project);
    expect(next.y).toBeGreaterThan(Math.max(...Object.values(pos).map((p) => p.y)));
  });
});
