import {
  containers,
  extractTransitions,
  type ContainerKind,
  type Issue,
  type Position,
  type Project,
  type Transition,
} from "@ui-editor/poc-model";
import { autoLayout } from "../../layout/dagre";

export const CONTAINER_WIDTH = 190;
export const CONTAINER_HEIGHT = 70;

export interface FlowNodeData extends Record<string, unknown> {
  id: string;
  name: string;
  kind: ContainerKind;
  entry: boolean;
  /** 出ていく遷移のうち仮の部品のままのもの。 */
  placeholders: number;
  outgoing: number;
  issueCount: number;
}

export interface FlowEdgeData extends Record<string, unknown> {
  transition: Transition;
  label: string;
}

export interface FlowGraph {
  nodes: { id: string; position: Position; data: FlowNodeData }[];
  edges: { id: string; source: string; target: string; data: FlowEdgeData }[];
}

/** 線に出すトリガーの説明。 */
export function triggerLabel(t: Transition): string {
  const what =
    t.event === "mount"
      ? "画面を開いたとき"
      : t.event === "rowClick"
        ? `行クリック（${t.node}）`
        : t.event === "rowSelect"
          ? `行の選択（${t.node}）`
          : (t.label ?? `${t.event}（${t.node}）`);
  return t.onClose ? `${what} → ${t.onClose.dialog} を閉じたら（${t.onClose.result}）` : what;
}

export function flowGraph(project: Project, issues: readonly Issue[]): FlowGraph {
  const refs = containers(project);
  const transitions = extractTransitions(project);
  const entry = project.entry ?? project.screens[0]?.id;
  const ids = new Set(refs.map((r) => r.container.id));
  const issueCounts = new Map<string, number>();
  for (const i of issues) {
    const [head, index] = i.path;
    if ((head === "screens" || head === "dialogs") && typeof index === "number") {
      const c = (head === "screens" ? project.screens : project.dialogs)[index];
      if (c) issueCounts.set(c.id, (issueCounts.get(c.id) ?? 0) + 1);
    }
  }
  const edges: FlowGraph["edges"] = transitions
    .filter((t) => ids.has(t.from) && ids.has(t.to))
    .map((t) => ({
      id: t.key,
      source: t.from,
      target: t.to,
      data: { transition: t, label: triggerLabel(t) },
    }));

  const saved = project.layout?.flow ?? {};
  const missing = refs.some((r) => !saved[r.container.id]);
  const auto = missing ? flowAutoPositions(project) : {};
  return {
    nodes: refs.map((r) => {
      const out = transitions.filter((t) => t.from === r.container.id);
      return {
        id: r.container.id,
        position: saved[r.container.id] ?? auto[r.container.id] ?? { x: 0, y: 0 },
        data: {
          id: r.container.id,
          name: r.container.name,
          kind: r.kind,
          entry: r.container.id === entry,
          placeholders: out.filter((t) => t.placeholder).length,
          outgoing: out.length,
          issueCount: issueCounts.get(r.container.id) ?? 0,
        },
      };
    }),
    edges,
  };
}

/** すべての画面・ダイアログを自動配置した位置（「整列」用）。最初の画面が左に来る。 */
export function flowAutoPositions(project: Project): Record<string, Position> {
  const refs = containers(project);
  return autoLayout(
    refs.map((r) => ({ id: r.container.id, width: CONTAINER_WIDTH, height: CONTAINER_HEIGHT })),
    extractTransitions(project).map((t) => ({ source: t.from, target: t.to })),
    { nodesep: 40, ranksep: 110 },
  );
}

/** 新しい画面・ダイアログを置く位置（既存のノードの下）。 */
export function nextContainerPosition(project: Project): Position {
  const positions = flowGraph(project, []).nodes.map((n) => n.position);
  if (positions.length === 0) return { x: 40, y: 40 };
  return {
    x: Math.min(...positions.map((p) => p.x)),
    y: Math.max(...positions.map((p) => p.y)) + CONTAINER_HEIGHT + 40,
  };
}
