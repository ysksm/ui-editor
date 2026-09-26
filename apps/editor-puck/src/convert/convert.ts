import type { ComponentData, Data } from "@puckeditor/core";
import type { JsonValue, Node, Style } from "@ui-editor/schema";

/**
 * P0 の node ツリー ⇔ Puck のデータの変換。
 *
 * - 1 つのツリー（画面・ダイアログ・コンポーネントの `root`）を 1 つの Puck データにする。
 *   Puck の `content` は配列なので `content = [root]` とし、Puck の root は使わない（空の入れ物）。
 * - node → Puck の item: `type` はそのまま、`id` は `props.id`、node.props は Puck の props に平らに展開する。
 *   `style` はそのまま `props.style`。子は `Box` だけ Puck の slot（`props.children`）にする。
 * - Puck の欄が無いもの（repeat / visible / events、slot を持たない type の children、
 *   予約語と衝突した props）は `props._p0` にそのまま入れておき、戻すときに復元する。
 */

/** 子を Puck の slot として持つ type。 */
export const SLOT_TYPES: ReadonlySet<string> = new Set(["Box"]);

/** Puck の props のうち、node.props ではないもの。 */
const RESERVED = new Set(["id", "style", "children", "_p0"]);

/** Puck の欄で編集しない node の情報。 */
export interface P0Extra {
  repeat?: Node["repeat"];
  visible?: Node["visible"];
  events?: Node["events"];
  /** slot を持たない type の children（P0 の node のまま）。 */
  children?: Node[];
  /** 予約語（id / style / children / _p0）と同じ名前の node.props。 */
  props?: Record<string, JsonValue>;
}

export type PuckItem = ComponentData<Record<string, unknown>>;

export function nodeToPuck(node: Node): PuckItem {
  const props: Record<string, unknown> = { id: node.id };
  const extra: P0Extra = {};
  for (const [key, value] of Object.entries(node.props ?? {})) {
    if (RESERVED.has(key)) (extra.props ??= {})[key] = value;
    else props[key] = value;
  }
  if (node.style !== undefined) props.style = node.style;
  if (SLOT_TYPES.has(node.type)) {
    props.children = (node.children ?? []).map(nodeToPuck);
  } else if (node.children !== undefined) {
    extra.children = node.children;
  }
  if (node.repeat !== undefined) extra.repeat = node.repeat;
  if (node.visible !== undefined) extra.visible = node.visible;
  if (node.events !== undefined) extra.events = node.events;
  if (Object.keys(extra).length > 0) props._p0 = extra;
  return { type: node.type, props: props as PuckItem["props"] };
}

export function puckToNode(item: PuckItem): Node {
  const { id, style, children, _p0, ...rest } = item.props as Record<string, unknown>;
  const extra = (_p0 ?? {}) as P0Extra;
  const node: Node = { id: String(id), type: item.type };

  const props: Record<string, JsonValue> = {};
  for (const [key, value] of Object.entries(rest)) {
    if (value !== undefined) props[key] = value as JsonValue;
  }
  Object.assign(props, extra.props);
  if (Object.keys(props).length > 0) node.props = props;

  const cleanStyle = dropUndefined(style as Style | undefined);
  if (cleanStyle !== undefined) node.style = cleanStyle;
  if (extra.repeat !== undefined) node.repeat = extra.repeat;
  if (extra.visible !== undefined) node.visible = extra.visible;
  if (extra.events !== undefined) node.events = extra.events;

  if (SLOT_TYPES.has(item.type)) {
    const slot = (children ?? []) as PuckItem[];
    if (slot.length > 0) node.children = slot.map(puckToNode);
  } else if (extra.children !== undefined) {
    node.children = extra.children;
  }
  return node;
}

/** 値が undefined のキーを除く。すべて消えたら undefined。 */
function dropUndefined<T extends object>(value: T | undefined): T | undefined {
  if (value === undefined) return undefined;
  const entries = Object.entries(value).filter(([, v]) => v !== undefined);
  return entries.length > 0 ? (Object.fromEntries(entries) as T) : undefined;
}

export function treeToPuck(root: Node): Data {
  return { root: { props: {} }, content: [nodeToPuck(root)] };
}

export type TreeResult = { ok: true; root: Node } | { ok: false; message: string };

/**
 * Puck のデータをツリーに戻す。P0 のツリーは root が 1 つなので、
 * 一番外に 2 つ以上置かれている場合や空の場合はエラーにする（エディタで警告を出す）。
 */
export function puckToTree(data: Data): TreeResult {
  const items = data.content as PuckItem[];
  if (items.length === 1) return { ok: true, root: puckToNode(items[0]!) };
  if (items.length === 0) return { ok: false, message: "パーツがありません" };
  return {
    ok: false,
    message: `一番外にパーツが ${items.length} 個あります。1 つの Container にまとめてください`,
  };
}
