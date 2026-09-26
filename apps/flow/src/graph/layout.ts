import dagre from "@dagrejs/dagre";
import type { XY } from "./layout-file";

export type { XY };

export interface Size {
  width: number;
  height: number;
}

/** dagre で左から右へ自動配置する。返すのは各ノードの左上の座標。 */
export function autoLayout(
  nodes: { id: string; size: Size }[],
  edges: { source: string; target: string }[],
): Record<string, XY> {
  const g = new dagre.graphlib.Graph({ multigraph: true });
  g.setGraph({ rankdir: "LR", nodesep: 60, ranksep: 140, marginx: 20, marginy: 20 });
  g.setDefaultEdgeLabel(() => ({}));
  for (const n of nodes) g.setNode(n.id, { width: n.size.width, height: n.size.height });
  edges.forEach((e, i) => {
    if (e.source !== e.target && g.hasNode(e.source) && g.hasNode(e.target)) {
      g.setEdge(e.source, e.target, {}, `e${i}`);
    }
  });
  dagre.layout(g);

  const out: Record<string, XY> = {};
  for (const n of nodes) {
    const p = g.node(n.id);
    out[n.id] = { x: Math.round(p.x - n.size.width / 2), y: Math.round(p.y - n.size.height / 2) };
  }
  return out;
}

/** 保存済みの位置を優先し、無いノードは自動配置の位置を使う。 */
export function mergePositions(
  ids: string[],
  auto: Record<string, XY>,
  saved: Record<string, XY>,
): Record<string, XY> {
  const out: Record<string, XY> = {};
  for (const id of ids) out[id] = saved[id] ?? auto[id] ?? { x: 0, y: 0 };
  return out;
}
