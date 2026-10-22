import dagre from "@dagrejs/dagre";
import type { Position } from "@ui-editor/poc-model";

export interface LayoutNode {
  id: string;
  width: number;
  height: number;
}

/** dagre で左から右へ自動配置する。返すのは各ノードの左上の座標（整数）。 */
export function autoLayout(
  nodes: readonly LayoutNode[],
  edges: readonly { source: string; target: string }[],
  options: { nodesep?: number; ranksep?: number } = {},
): Record<string, Position> {
  const g = new dagre.graphlib.Graph({ multigraph: true });
  g.setGraph({
    rankdir: "LR",
    nodesep: options.nodesep ?? 50,
    ranksep: options.ranksep ?? 120,
    marginx: 20,
    marginy: 20,
  });
  g.setDefaultEdgeLabel(() => ({}));
  for (const n of nodes) g.setNode(n.id, { width: n.width, height: n.height });
  edges.forEach((e, i) => {
    if (e.source !== e.target && g.hasNode(e.source) && g.hasNode(e.target)) {
      g.setEdge(e.source, e.target, {}, `e${i}`);
    }
  });
  dagre.layout(g);
  const out: Record<string, Position> = {};
  for (const n of nodes) {
    const p = g.node(n.id);
    out[n.id] = { x: Math.round(p.x - n.width / 2), y: Math.round(p.y - n.height / 2) };
  }
  return out;
}
