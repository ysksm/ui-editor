import {
  ID_PATTERN,
  type Action,
  type Container,
  type Node,
  type Position,
  type Project,
} from "../schema.js";
import { containers, walkActions, type ContainerKind, type ContainerRef } from "../walk.js";
import { numberedId } from "./ids.js";

/**
 * 画面・ダイアログの編集操作（`(draft: Project, …) => …`）。
 * 前提を満たさない呼び出しは Error を投げる（エディタは先に `…Problem` で確かめる）。
 */

function refOf(draft: Project, id: string): ContainerRef {
  const ref = containers(draft).find((c) => c.container.id === id);
  if (!ref) throw new Error(`画面・ダイアログ "${id}" がありません`);
  return ref;
}

/** 画面・ダイアログの id として使えない理由（使えるなら undefined）。画面とダイアログで名前空間は共通。 */
export function containerIdProblem(
  project: Pick<Project, "screens" | "dialogs">,
  id: string,
  self?: string,
): string | undefined {
  if (!ID_PATTERN.test(id)) return "英字で始まる英数字（_ と - も可）にしてください";
  if (id !== self && containers(project).some((c) => c.container.id === id))
    return `"${id}" は既にあります`;
  return undefined;
}

export function addContainer(
  draft: Project,
  kind: ContainerKind,
  init: { id?: string; name?: string; position?: Position } = {},
): string {
  const id =
    init.id ??
    numberedId(
      kind,
      containers(draft).map((c) => c.container.id),
    );
  const problem = containerIdProblem(draft, id);
  if (problem) throw new Error(problem);
  const n = id.replace(/^(screen|dialog)/, "");
  const name = init.name ?? (init.id ? id : `${kind === "screen" ? "画面" : "ダイアログ"}${n}`);
  if (kind === "screen") draft.screens.push({ id, name });
  else draft.dialogs.push({ id, name });
  if (init.position) setFlowPosition(draft, id, init.position);
  return id;
}

export function updateContainer(
  draft: Project,
  id: string,
  patch: { name?: string; path?: string | undefined },
): void {
  const { container, kind } = refOf(draft, id);
  if (patch.name !== undefined) container.name = patch.name;
  if ("path" in patch && kind === "screen") {
    if (patch.path === undefined || patch.path === "") delete (container as { path?: string }).path;
    else (container as { path?: string }).path = patch.path;
  }
}

/** id を変え、遷移（navigate.to / openDialog.dialog）・entry・layout.flow の参照も書き換える。 */
export function renameContainerId(draft: Project, oldId: string, newId: string): void {
  if (oldId === newId) return;
  const problem = containerIdProblem(draft, newId, oldId);
  if (problem) throw new Error(problem);
  refOf(draft, oldId).container.id = newId;
  mapActionLists(draft, (list) => {
    for (const a of list) {
      if (a.type === "navigate" && a.to === oldId) a.to = newId;
      if (a.type === "openDialog" && a.dialog === oldId) a.dialog = newId;
    }
    return list;
  });
  if (draft.entry === oldId) draft.entry = newId;
  const flow = draft.layout?.flow;
  if (flow && oldId in flow) {
    flow[newId] = flow[oldId]!;
    delete flow[oldId];
  }
}

/**
 * 画面・ダイアログを消す。そこへの遷移（navigate / openDialog）も消し、
 * そのためにイベントが空になった仮の部品も消す。entry と layout.flow からも外す。
 */
export function deleteContainer(draft: Project, id: string): void {
  const ref = refOf(draft, id);
  if (ref.kind === "screen") draft.screens.splice(ref.index, 1);
  else draft.dialogs.splice(ref.index, 1);
  mapActionLists(draft, (list) => list.filter((a) => !targets(a, id)));
  pruneAll(draft);
  if (draft.entry === id) delete draft.entry;
  if (draft.layout?.flow) delete draft.layout.flow[id];
}

/** 消すと一緒に消える遷移の数（確認の表示用）。 */
export function countTransitionsTo(project: Project, id: string): number {
  let n = 0;
  walkActions(project, ({ action }) => void (targets(action, id) && n++));
  return n;
}

function targets(a: Action, id: string): boolean {
  return (a.type === "navigate" && a.to === id) || (a.type === "openDialog" && a.dialog === id);
}

/** 最初の画面（entry）を決める。undefined なら外す（screens[0] が最初になる）。 */
export function setEntry(draft: Project, id: string | undefined): void {
  if (id === undefined) {
    delete draft.entry;
    return;
  }
  if (refOf(draft, id).kind !== "screen")
    throw new Error("最初の画面にはダイアログを指定できません");
  draft.entry = id;
}

export function setFlowPosition(draft: Project, id: string, position: Position): void {
  draft.layout ??= {};
  draft.layout.flow ??= {};
  draft.layout.flow[id] = { x: Math.round(position.x), y: Math.round(position.y) };
}

/** フロー図の配置をまとめて置き換える（自動レイアウト）。 */
export function setFlowPositions(draft: Project, positions: Record<string, Position>): void {
  draft.layout ??= {};
  draft.layout.flow = Object.fromEntries(
    Object.entries(positions).map(([id, p]) => [id, { x: Math.round(p.x), y: Math.round(p.y) }]),
  );
}

// ---- アクション列の書き換え ----

/**
 * プロジェクトのすべてのアクション列（画面の mount、ノードのイベント、openDialog の onClose）に
 * `fn` を当て、返した列で置き換える。空になったイベント・onClose は消す。
 */
export function mapActionLists(draft: Project, fn: (list: Action[]) => Action[]): void {
  const mapList = (list: Action[]): Action[] => {
    const next = fn(list);
    for (const a of next) {
      if (a.type !== "openDialog" || !a.onClose) continue;
      for (const [result, inner] of Object.entries(a.onClose)) {
        const mapped = mapList(inner);
        if (mapped.length > 0) a.onClose[result] = mapped;
        else delete a.onClose[result];
      }
      if (Object.keys(a.onClose).length === 0) delete a.onClose;
    }
    return next;
  };
  const mapEvents = (events: Record<string, Action[]>) => {
    for (const [name, list] of Object.entries(events)) {
      const mapped = mapList(list);
      if (mapped.length > 0) events[name] = mapped;
      else delete events[name];
    }
  };
  for (const { container } of containers(draft)) {
    if ("events" in container && container.events?.mount) {
      const mapped = mapList(container.events.mount);
      if (mapped.length > 0) container.events.mount = mapped;
      else delete container.events.mount;
      if (Object.keys(container.events).length === 0) delete container.events;
    }
    const visit = (node: Node) => {
      if (node.events) {
        mapEvents(node.events);
        if (Object.keys(node.events).length === 0) delete node.events;
      }
      node.children?.forEach(visit);
    };
    if (container.root) visit(container.root);
  }
}

/** イベントが空になった仮の部品を消す（子の無い Box の仮の部品も。選択できる仮の表は残す）。 */
export function pruneAll(draft: Project): void {
  for (const { container } of containers(draft)) {
    if (container.root) {
      const root = pruneNode(container.root);
      if (root) container.root = root;
      else delete (container as Container).root;
    }
  }
}

function pruneNode(node: Node): Node | undefined {
  if (node.children) {
    const kept = node.children.map(pruneNode).filter((n): n is Node => n !== undefined);
    if (kept.length !== node.children.length) node.children = kept;
  }
  // 選択できる仮の表は、イベントが無くても選択（T3）に使うので残す
  const empty =
    node.placeholder === true &&
    Object.keys(node.events ?? {}).length === 0 &&
    (node.children?.length ?? 0) === 0 &&
    !(node.type === "Table" && node.props?.selectable === true);
  return empty ? undefined : node;
}
