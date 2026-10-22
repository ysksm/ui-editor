import { findTransition, type Transition } from "../flow.js";
import type {
  Action,
  Container,
  Entity,
  NavigateAction,
  Node,
  OpenDialogAction,
  Params,
  Project,
} from "../schema.js";
import { containers, findNode, walkNodes, type ContainerRef } from "../walk.js";
import { mapActionLists, pruneAll } from "./containers.js";
import { numberedId, uniqueId } from "./ids.js";

/**
 * 遷移の編集操作（D1 の案 b: 線を引くと遷移元に仮の部品を置く。architecture.md 4.3）。
 * 遷移の key は位置から導くので、位置が変わる操作は新しい key を返す。
 */

function nodeIds(root: Node | undefined): string[] {
  const ids: string[] = [];
  if (root) walkNodes(root, [], (n) => ids.push(n.id));
  return ids;
}

function refOf(draft: Project, id: string): ContainerRef {
  const ref = containers(draft).find((c) => c.container.id === id);
  if (!ref) throw new Error(`画面・ダイアログ "${id}" がありません`);
  return ref;
}

/** root を（仮の）縦並びの Box にして返す。無ければ作り、1 部品だけなら包む。 */
function boxRoot(c: Container): Node {
  if (!c.root) {
    c.root = {
      id: "page",
      type: "Box",
      placeholder: true,
      props: { direction: "column", gap: 8 },
      children: [],
    };
  } else if (c.root.type !== "Box") {
    c.root = {
      id: uniqueId("page", nodeIds(c.root)),
      type: "Box",
      placeholder: true,
      props: { direction: "column", gap: 8 },
      children: [c.root],
    };
  }
  c.root.children ??= [];
  return c.root;
}

function moveAction(target: ContainerRef): NavigateAction | OpenDialogAction {
  const to = target.container.id;
  return target.kind === "screen" ? { type: "navigate", to } : { type: "openDialog", dialog: to };
}

function defaultLabel(target: ContainerRef): string {
  return target.kind === "screen" ? `${target.container.name}へ` : `${target.container.name}を開く`;
}

/**
 * from → to の遷移を作る。from の root の末尾に仮のボタンを置き、その click に
 * navigate（to が画面）か openDialog（to がダイアログ）を書く。root が無ければ（仮の）縦並びの Box を作る。
 * 作った遷移の key を返す。
 */
export function addTransition(draft: Project, from: string, to: string): string {
  const c = refOf(draft, from).container;
  const target = refOf(draft, to);
  const root = boxRoot(c);
  const id = numberedId("btn", nodeIds(root));
  root.children!.push({
    id,
    type: "Button",
    placeholder: true,
    props: { label: defaultLabel(target) },
    events: { click: [moveAction(target)] },
  });
  return `${from}:${id}:click:0`;
}

/** 遷移を消す。アクションを消し、空になったイベントと仮の部品も消す。 */
export function deleteTransition(draft: Project, key: string): void {
  const t = transitionOf(draft, key);
  listAt(draft, t).splice(Number(t.path.at(-1)), 1);
  cleanup(draft);
}

/** 遷移のアクションが入っている配列（draft の中）。 */
export function listAt(draft: Project, t: Pick<Transition, "path">): Action[] {
  let cur: unknown = draft;
  for (const p of t.path.slice(0, -1)) cur = (cur as Record<string | number, unknown>)[p];
  if (!Array.isArray(cur)) throw new Error("遷移の場所が見つかりません");
  return cur as Action[];
}

function transitionOf(draft: Project, key: string): Transition {
  const t = findTransition(draft, key);
  if (!t) throw new Error("遷移が見つかりません");
  return t;
}

function actionOf(draft: Project, t: Transition): Action & { type: "navigate" | "openDialog" } {
  return listAt(draft, t)[Number(t.path.at(-1))] as Action & { type: "navigate" | "openDialog" };
}

/** 空になったイベント・onClose と、イベントが空になった仮の部品を消す。 */
function cleanup(draft: Project): void {
  mapActionLists(draft, (l) => l);
  pruneAll(draft);
}

// ---- 遷移先・渡す値・アクション列 ----

/** 遷移先を変える。画面とダイアログをまたぐと navigate ↔ openDialog を入れ替える（渡す値は残す）。 */
export function retargetTransition(draft: Project, key: string, to: string): void {
  const t = transitionOf(draft, key);
  const target = refOf(draft, to);
  const list = listAt(draft, t);
  const i = Number(t.path.at(-1));
  const old = actionOf(draft, t);
  const next = moveAction(target);
  if (old.params) next.params = old.params;
  if (old.when !== undefined) next.when = old.when;
  if (old.type === "openDialog" && next.type === "openDialog" && old.onClose)
    next.onClose = old.onClose;
  list[i] = next;
}

/** 渡す値を置き換える（空なら消す）。 */
export function setTransitionParams(draft: Project, key: string, params: Params | undefined): void {
  const action = actionOf(draft, transitionOf(draft, key));
  if (params && Object.keys(params).length > 0) action.params = params;
  else delete action.params;
}

/**
 * 遷移が入っているイベントのアクション列（付随アクションを含む）を置き換える。
 * 遷移のアクションの新しい位置から、新しい key を返す（遷移が無くなったら undefined）。
 */
export function setTransitionActions(
  draft: Project,
  key: string,
  actions: Action[],
): string | undefined {
  const t = transitionOf(draft, key);
  const list = listAt(draft, t);
  const kept = actions.findIndex(
    (a) =>
      (a.type === "navigate" && a.to === t.to) || (a.type === "openDialog" && a.dialog === t.to),
  );
  list.splice(0, list.length, ...actions);
  cleanup(draft);
  if (kept < 0) return undefined;
  const prefix = key.slice(0, key.length - String(t.path.at(-1)).length);
  return `${prefix}${kept}`;
}

// ---- トリガー ----

/**
 * - `button`（T1）: ボタンの click。`node` が無ければ仮のボタンを置く
 * - `rowClick`（T2）: 表の行クリック。`node` が無ければ `entity` の仮の表を置く
 * - `selectButton`（T3）: 表で行を選んでからボタン。表を選択できるようにし、ボタンに `requires: selection.<entity>` を付ける
 * - `mount`（T5）: 画面を開いたとき（画面だけ）
 */
export type TriggerSpec =
  | { kind: "button"; node?: string | undefined }
  | { kind: "rowClick"; node?: string | undefined; entity?: string | undefined }
  | { kind: "selectButton"; node?: string | undefined; table?: string | undefined; entity: string }
  | { kind: "mount" };

/** 遷移の今のトリガーの種類。 */
export function triggerKind(project: Project, t: Transition): TriggerSpec["kind"] {
  if (t.event === "mount") return "mount";
  if (t.event === "rowClick") return "rowClick";
  const c = containers(project).find((r) => r.container.id === t.from)?.container;
  const node = t.node ? findNode(c?.root, t.node) : undefined;
  return typeof node?.props?.requires === "string" && node.props.requires.startsWith("selection.")
    ? "selectButton"
    : "button";
}

/**
 * 遷移のトリガーを変える。遷移が入っているイベントのアクション列（付随アクションごと）を、
 * 新しい部品・イベントへ移す。移した先の部品が無ければ仮の部品を置き、空になった仮の部品は消す。
 * 表の行・選択から遷移先のパラメータ（遷移先のエンティティを指す ref）を埋める。新しい key を返す。
 */
export function setTrigger(draft: Project, key: string, spec: TriggerSpec): string {
  const t = transitionOf(draft, key);
  if (t.onClose)
    throw new Error(
      "ダイアログを閉じた後の遷移のトリガーは変えられません（openDialog の onClose で決まる）",
    );
  const from = refOf(draft, t.from);
  const target = refOf(draft, t.to);
  const c = from.container;
  const list = listAt(draft, t);
  const moved = list.splice(0, list.length);
  const entities = new Map(draft.entities.map((e) => [e.id, e]));

  const place = (node: Node, event: string): string => {
    node.events ??= {};
    const existing = node.events[event] ?? [];
    node.events[event] = [...existing, ...moved];
    return `${t.from}:${node.id}:${event}:${existing.length + transitionIndex(moved, t)}`;
  };
  // 今のトリガーが仮のボタンなら、部品を指定しないときはそれを使い回す
  const current = t.node ? findNode(c.root, t.node) : undefined;
  const reusable = current?.placeholder && current.type === "Button" ? current.id : undefined;
  const button = (id: string | undefined): Node => {
    const root = boxRoot(c);
    const found = findNode(root, id ?? reusable ?? "");
    if (found) {
      if (found.type !== "Button") throw new Error(`"${id}" はボタンではありません`);
      return found;
    }
    const b: Node = {
      id: numberedId("btn", nodeIds(root)),
      type: "Button",
      placeholder: true,
      props: { label: t.label ?? defaultLabel(target) },
    };
    root.children!.push(b);
    return b;
  };
  const table = (id: string | undefined, entity: Entity | undefined, selectable: boolean): Node => {
    const root = boxRoot(c);
    const found = id ? findNode(root, id) : undefined;
    if (found) {
      if (found.type !== "Table") throw new Error(`"${id}" は表ではありません`);
      found.props ??= {};
      if (entity && found.props.entity === undefined) found.props.entity = entity.id;
      if (selectable) found.props.selectable = true;
      return found;
    }
    if (!entity) throw new Error("仮の表のエンティティを選んでください");
    const tbl: Node = {
      id: uniqueId("table", nodeIds(root)),
      type: "Table",
      placeholder: true,
      props: {
        rows: `{{ data.${entity.id} }}`,
        entity: entity.id,
        columns: tableColumns(entity),
        ...(selectable ? { selectable: true } : {}),
      },
    };
    // 表はボタンより前（上）に置く
    const firstButton = root.children!.findIndex((n) => n.type === "Button");
    root.children!.splice(firstButton < 0 ? root.children!.length : firstButton, 0, tbl);
    return tbl;
  };

  let newKey: string;
  switch (spec.kind) {
    case "button": {
      const b = button(spec.node);
      if (b.placeholder && typeof b.props?.requires === "string") delete b.props.requires;
      newKey = place(b, "click");
      break;
    }
    case "rowClick": {
      const tbl = table(spec.node, spec.entity ? entities.get(spec.entity) : undefined, false);
      const entity = entities.get(String(tbl.props?.entity ?? ""));
      newKey = place(tbl, "rowClick");
      fillParam(draft, newKey, target, entity, (pk) => `{{ event.row.${pk} }}`);
      break;
    }
    case "selectButton": {
      const entity = entities.get(spec.entity);
      if (!entity) throw new Error(`エンティティ "${spec.entity}" がありません`);
      table(spec.table, entity, true);
      const b = button(spec.node);
      b.props ??= {};
      b.props.requires = `selection.${entity.id}`;
      newKey = place(b, "click");
      fillParam(draft, newKey, target, entity, (pk) => `{{ state.selection.${entity.id}?.${pk} }}`);
      break;
    }
    case "mount": {
      if (from.kind !== "screen") throw new Error("画面を開いたとき（mount）は画面だけで使えます");
      const screen = c as Container & { events?: { mount?: Action[] } };
      screen.events ??= {};
      const existing = screen.events.mount ?? [];
      screen.events.mount = [...existing, ...moved];
      newKey = `${t.from}::mount:${existing.length + transitionIndex(moved, t)}`;
      break;
    }
  }
  cleanup(draft);
  return newKey;
}

/** 移したアクション列の中の、遷移のアクションの位置。 */
function transitionIndex(moved: readonly Action[], t: Transition): number {
  const i = moved.findIndex(
    (a) =>
      (a.type === "navigate" && a.to === t.to) || (a.type === "openDialog" && a.dialog === t.to),
  );
  return Math.max(0, i);
}

/** 遷移先にエンティティを指す ref パラメータがあり、まだ値が無ければ埋める。 */
function fillParam(
  draft: Project,
  key: string,
  target: ContainerRef,
  entity: Entity | undefined,
  value: (pk: string) => string,
): void {
  if (!entity) return;
  const name = Object.entries(target.container.params ?? {}).find(
    ([, def]) => def.type === "ref" && def.entity === entity.id,
  )?.[0];
  if (!name) return;
  const action = actionOf(draft, transitionOf(draft, key));
  if (action.params?.[name] !== undefined) return;
  action.params = { ...action.params, [name]: value(entity.primaryKey) };
}

/** 仮の表の列（表示用フィールドを先頭に、値のフィールドを 4 つまで）。式は null を考慮する。 */
export function tableColumns(entity: Entity): { header: string; value: string }[] {
  const fields = entity.fields.filter((f) => f.type !== "children" && f.id !== entity.primaryKey);
  const first = fields.find((f) => f.id === entity.displayField);
  const ordered = first ? [first, ...fields.filter((f) => f !== first)] : fields;
  return ordered.slice(0, 4).map((f) => ({ header: f.name ?? f.id, value: `{{ row.${f.id} }}` }));
}

/**
 * 部品から遷移を作る（仮の部品を経ない。FR-UI-03）。ボタンなどは click、表は rowClick に足す。
 * 遷移先のレコードを指す ref パラメータは、表の行・ボタンの requires の選択・遷移元のパラメータから埋める。
 * 作った遷移の key を返す。
 */
export function addTransitionFrom(
  draft: Project,
  containerId: string,
  nodeId: string,
  to: string,
): string {
  const c = refOf(draft, containerId).container;
  const target = refOf(draft, to);
  const node = findNode(c.root, nodeId);
  if (!node) throw new Error(`部品 "${nodeId}" がありません`);
  const event = node.type === "Table" ? "rowClick" : "click";
  node.events ??= {};
  const list = node.events[event] ?? [];
  node.events[event] = [...list, moveAction(target)];
  const key = `${containerId}:${nodeId}:${event}:${list.length}`;
  const entities = new Map(draft.entities.map((e) => [e.id, e]));
  if (node.type === "Table" && typeof node.props?.entity === "string") {
    fillParam(draft, key, target, entities.get(node.props.entity), (pk) => `{{ event.row.${pk} }}`);
  } else if (
    typeof node.props?.requires === "string" &&
    node.props.requires.startsWith("selection.")
  ) {
    const e = entities.get(node.props.requires.slice("selection.".length));
    fillParam(draft, key, target, e, (pk) => `{{ state.selection.${e?.id}?.${pk} }}`);
  }
  // 遷移元に同じエンティティを指すパラメータがあれば、それを渡す（詳細 → 編集・削除の確認など）
  for (const [name, def] of Object.entries(target.container.params ?? {})) {
    if (def.type !== "ref" || !def.entity) continue;
    const own = Object.entries(c.params ?? {}).find(
      ([, d]) => d.type === "ref" && d.entity === def.entity,
    )?.[0];
    const action = actionOf(draft, transitionOf(draft, key));
    if (own && action.params?.[name] === undefined)
      action.params = { ...action.params, [name]: `{{ params.${own} }}` };
  }
  return key;
}
