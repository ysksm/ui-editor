import type { Action, Events, Node, Project } from "@ui-editor/schema";

/**
 * P0 のプロジェクトから遷移図のノード（画面・ダイアログ）とエッジ（遷移）を取り出す。
 * エッジになるのは `navigate` / `openDialog` だけ。
 */

export type FlowNodeKind = "screen" | "dialog";

export interface FlowNodeInfo {
  kind: FlowNodeKind;
  id: string;
  name: string;
  root: Node;
}

export type TransitionKind = "navigate" | "openDialog";

/**
 * 遷移を起こすアクションの場所。P5-2 でアクションを追加・削除するときの住所になる。
 * - `nodeId` が undefined … 画面自体のイベント（`screens[].events`）
 * - `component` がある … コンポーネント内のノードのイベント。`nodeId` はそのインスタンス
 */
export interface TriggerAddress {
  ownerKind: FlowNodeKind;
  ownerId: string;
  nodeId: string | undefined;
  component?: { id: string; nodeId: string } | undefined;
  event: string;
  actionIndex: number;
}

export interface Transition {
  id: string;
  kind: TransitionKind;
  source: string;
  target: string;
  trigger: TriggerAddress;
}

export interface FlowGraph {
  nodes: FlowNodeInfo[];
  transitions: Transition[];
}

/** 画面自体のイベントのハンドル id。 */
export const SCREEN_HANDLE = "screen";

/** 起点パーツのハンドル id（ノード id は画面・ダイアログの中で一意）。 */
export function sourceHandleOf(trigger: TriggerAddress): string {
  return trigger.nodeId === undefined ? SCREEN_HANDLE : `part:${trigger.nodeId}`;
}

export function transitionId(t: TriggerAddress): string {
  const where = t.nodeId === undefined ? "@screen" : t.nodeId;
  const inComponent = t.component ? `>${t.component.id}.${t.component.nodeId}` : "";
  return `${t.ownerKind}:${t.ownerId}/${where}${inComponent}#${t.event}[${t.actionIndex}]`;
}

export function extractFlow(project: Project): FlowGraph {
  const components = new Map((project.components ?? []).map((c) => [c.id, c]));
  const nodes: FlowNodeInfo[] = [
    ...project.screens.map((s) => ({
      kind: "screen" as const,
      id: s.id,
      name: s.name,
      root: s.root,
    })),
    ...(project.dialogs ?? []).map((d) => ({
      kind: "dialog" as const,
      id: d.id,
      name: d.name,
      root: d.root,
    })),
  ];
  const transitions: Transition[] = [];

  const addFromEvents = (
    events: Events | undefined,
    base: Omit<TriggerAddress, "event" | "actionIndex">,
  ) => {
    for (const [event, actions] of Object.entries(events ?? {})) {
      actions.forEach((action, actionIndex) => {
        const target = transitionTarget(action);
        if (!target) return;
        const trigger: TriggerAddress = { ...base, event, actionIndex };
        transitions.push({
          id: transitionId(trigger),
          kind: target.kind,
          source: base.ownerId,
          target: target.id,
          trigger,
        });
      });
    }
  };

  /** コンポーネント内のアクションは、インスタンスを置いた画面・ダイアログから出る遷移として扱う。 */
  const walkComponent = (
    componentId: string,
    owner: { kind: FlowNodeKind; id: string },
    instanceId: string,
    visiting: Set<string>,
  ) => {
    const component = components.get(componentId);
    if (!component || visiting.has(componentId)) return;
    visiting.add(componentId);
    walkTree(component.root, (node) => {
      addFromEvents(node.events, {
        ownerKind: owner.kind,
        ownerId: owner.id,
        nodeId: instanceId,
        component: { id: componentId, nodeId: node.id },
      });
      walkComponent(node.type, owner, instanceId, visiting);
    });
    visiting.delete(componentId);
  };

  for (const s of project.screens) {
    addFromEvents(s.events, { ownerKind: "screen", ownerId: s.id, nodeId: undefined });
  }
  for (const info of nodes) {
    walkTree(info.root, (node) => {
      addFromEvents(node.events, { ownerKind: info.kind, ownerId: info.id, nodeId: node.id });
      walkComponent(node.type, info, node.id, new Set());
    });
  }

  return { nodes, transitions };
}

function transitionTarget(action: Action): { kind: TransitionKind; id: string } | undefined {
  if (action.type === "navigate") return { kind: "navigate", id: action.to };
  if (action.type === "openDialog") return { kind: "openDialog", id: action.dialog };
  return undefined;
}

export function walkTree(node: Node, visit: (node: Node) => void): void {
  visit(node);
  for (const child of node.children ?? []) walkTree(child, visit);
}
