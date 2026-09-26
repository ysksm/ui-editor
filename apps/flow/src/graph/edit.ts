import {
  BUILTIN_NODE_TYPES,
  type Action,
  type Events,
  type JsonValue,
  type Node,
  type ParamDef,
  type Project,
} from "@ui-editor/schema";
import { transitionId, walkTree, type FlowNodeKind, type TriggerAddress } from "./extract";

/**
 * 遷移図での編集を P0 のプロジェクトに反映する。
 * どの関数も元のプロジェクトは変更せず、書き換えたコピーを返す。
 */

/** 遷移を引き出せるパーツ（画面・ダイアログ内のノード）。 */
export interface SourcePart {
  ownerKind: FlowNodeKind;
  ownerId: string;
  nodeId: string;
}

export interface TargetRef {
  kind: FlowNodeKind;
  id: string;
}

/** ノードの type ごとに、遷移を割り当てられるイベント。 */
export function eventsForType(type: string): string[] {
  switch (type) {
    case "Table":
      return ["rowClick"];
    case "TextInput":
    case "NumberInput":
    case "Checkbox":
      return ["change"];
    default:
      // Box / Text / Button / コンポーネントのインスタンス
      return ["click"];
  }
}

/** 遷移を引き出せるパーツか（ボタン・テーブル・コンポーネント・クリックできる Box など）。 */
export function isConnectablePart(node: Node): boolean {
  if (node.events && Object.keys(node.events).length > 0) return true;
  if (node.type === "Button" || node.type === "Table") return true;
  if (node.type === "Box") return node.style?.cursor === "pointer";
  return !(BUILTIN_NODE_TYPES as readonly string[]).includes(node.type);
}

/**
 * パーツから画面・ダイアログへの遷移を追加する。
 * アクションはパーツのイベント（省略時は type に応じた既定）の末尾に足す。
 */
export function addTransition(
  project: Project,
  source: SourcePart,
  target: TargetRef,
  event?: string,
): { project: Project; id: string } {
  const next = structuredClone(project);
  const node = findNode(next, source.ownerKind, source.ownerId, source.nodeId);
  const eventName = event ?? eventsForType(node.type)[0]!;
  const params = defaultParams(next, source, target);
  const action: Action =
    target.kind === "screen"
      ? { type: "navigate", to: target.id, ...(params && { params }) }
      : { type: "openDialog", dialog: target.id, ...(params && { params }) };
  const events: Events = (node.events ??= {});
  const actions = (events[eventName] ??= []);
  actions.push(action);
  const id = transitionId({
    ownerKind: source.ownerKind,
    ownerId: source.ownerId,
    nodeId: source.nodeId,
    event: eventName,
    actionIndex: actions.length - 1,
  });
  return { project: next, id };
}

/** 遷移（navigate / openDialog のアクション）を削除する。まとめて消しても番号はずれない。 */
export function removeTransitions(project: Project, triggers: TriggerAddress[]): Project {
  const next = structuredClone(project);
  // 同じイベントの中では後ろから消す
  const sorted = [...triggers].sort((a, b) => b.actionIndex - a.actionIndex);
  for (const t of sorted) {
    const holder = findHolder(next, t);
    const actions = holder.events?.[t.event];
    const action = actions?.[t.actionIndex];
    if (!actions || !action || (action.type !== "navigate" && action.type !== "openDialog")) {
      throw new Error(`遷移が見つかりません: ${t.ownerId} ${t.event}[${t.actionIndex}]`);
    }
    actions.splice(t.actionIndex, 1);
    if (actions.length === 0) delete holder.events![t.event];
    if (Object.keys(holder.events!).length === 0) delete holder.events;
  }
  return next;
}

/** 遷移の params を置き換える（値が空なら params ごと消す）。 */
export function setTransitionParams(
  project: Project,
  trigger: TriggerAddress,
  params: Record<string, JsonValue>,
): Project {
  const next = structuredClone(project);
  const action = findHolder(next, trigger).events?.[trigger.event]?.[trigger.actionIndex];
  if (!action || (action.type !== "navigate" && action.type !== "openDialog")) {
    throw new Error(`遷移が見つかりません: ${trigger.ownerId} ${trigger.event}`);
  }
  if (Object.keys(params).length > 0) action.params = params;
  else delete action.params;
  return next;
}

/** 遷移を別のイベントに付け替える（付け替え先の末尾に移る）。 */
export function moveTransitionToEvent(
  project: Project,
  trigger: TriggerAddress,
  event: string,
): { project: Project; id: string } {
  if (event === trigger.event) return { project, id: transitionId(trigger) };
  const next = structuredClone(project);
  const holder = findHolder(next, trigger);
  const [action] = holder.events?.[trigger.event]?.splice(trigger.actionIndex, 1) ?? [];
  if (!action) throw new Error(`遷移が見つかりません: ${trigger.ownerId} ${trigger.event}`);
  if (holder.events![trigger.event]!.length === 0) delete holder.events![trigger.event];
  const actions = (holder.events![event] ??= []);
  actions.push(action);
  return {
    project: next,
    id: transitionId({ ...trigger, event, actionIndex: actions.length - 1 }),
  };
}

/** 遷移のアクション（navigate / openDialog）を返す。見つからなければ undefined。 */
export function findTransitionAction(
  project: Project,
  trigger: TriggerAddress,
): Extract<Action, { type: "navigate" | "openDialog" }> | undefined {
  try {
    const action = findHolder(project, trigger).events?.[trigger.event]?.[trigger.actionIndex];
    return action?.type === "navigate" || action?.type === "openDialog" ? action : undefined;
  } catch {
    return undefined;
  }
}

/** 遷移を持つノード（または画面）の type。画面自体のイベントは `Screen`。 */
export function triggerNodeType(project: Project, trigger: TriggerAddress): string {
  if (trigger.nodeId === undefined) return "Screen";
  if (trigger.component) {
    return findInTree(componentRoot(project, trigger.component.id), trigger.component.nodeId).type;
  }
  return findNode(project, trigger.ownerKind, trigger.ownerId, trigger.nodeId).type;
}

/** 遷移先の params の定義。 */
export function targetParamDefs(project: Project, target: TargetRef): Record<string, ParamDef> {
  const owner =
    target.kind === "screen"
      ? project.screens.find((s) => s.id === target.id)
      : project.dialogs?.find((d) => d.id === target.id);
  return owner?.params ?? {};
}

/**
 * 遷移先の必須の params を埋める。遷移元に同じ名前の params があれば `{{ params.x }}`、
 * 無ければ空文字（エッジのパネルで入力してもらう）。
 */
function defaultParams(
  project: Project,
  source: SourcePart,
  target: TargetRef,
): Record<string, JsonValue> | undefined {
  const defs = targetParamDefs(project, target);
  const own = targetParamDefs(project, { kind: source.ownerKind, id: source.ownerId });
  const out: Record<string, JsonValue> = {};
  for (const [name, def] of Object.entries(defs)) {
    if (def.default !== undefined) continue;
    out[name] = own[name] ? `{{ params.${name} }}` : "";
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

// ---- 場所を探す ----

interface EventHolder {
  events?: Events | undefined;
}

function findHolder(project: Project, t: TriggerAddress): EventHolder {
  if (t.component) return findInTree(componentRoot(project, t.component.id), t.component.nodeId);
  if (t.nodeId === undefined) {
    const screen = project.screens.find((s) => s.id === t.ownerId);
    if (!screen) throw new Error(`画面 "${t.ownerId}" がありません`);
    return screen;
  }
  return findNode(project, t.ownerKind, t.ownerId, t.nodeId);
}

function findNode(project: Project, kind: FlowNodeKind, ownerId: string, nodeId: string): Node {
  const owner =
    kind === "screen"
      ? project.screens.find((s) => s.id === ownerId)
      : project.dialogs?.find((d) => d.id === ownerId);
  if (!owner)
    throw new Error(`${kind === "screen" ? "画面" : "ダイアログ"} "${ownerId}" がありません`);
  return findInTree(owner.root, nodeId);
}

function componentRoot(project: Project, componentId: string): Node {
  const component = project.components?.find((c) => c.id === componentId);
  if (!component) throw new Error(`コンポーネント "${componentId}" がありません`);
  return component.root;
}

function findInTree(root: Node, nodeId: string): Node {
  let found: Node | undefined;
  walkTree(root, (n) => {
    if (!found && n.id === nodeId) found = n;
  });
  if (!found) throw new Error(`ノード "${nodeId}" がありません`);
  return found;
}
