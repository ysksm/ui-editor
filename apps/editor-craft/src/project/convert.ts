import type { SerializedNode, SerializedNodes } from "@craftjs/core";
import {
  BUILTIN_NODE_TYPES,
  type BuiltinNodeType,
  type Events,
  type JsonValue,
  type Node,
  type Repeat,
  type Style,
} from "@ui-editor/schema";

/**
 * P0 のノード ⇔ Craft.js のシリアライズ形式（`SerializedNodes`）の変換。
 *
 * - Craft のノード 1 つ = P0 のノード 1 つ。P0 の id / type 以外のフィールドは Craft の props にそのまま入れる。
 * - Craft の resolver は `<Editor>` を作るときに固定されるため、コンポーネントのインスタンスは
 *   1 種類の Craft コンポーネント（`ComponentInstance`）で表し、コンポーネント id を props に持つ。
 * - 子を持てるのは Box だけ（Craft の canvas）。それ以外のノードに子があれば custom に退避してそのまま戻す。
 */

/** コンポーネントのインスタンスを表す Craft の resolvedName。 */
export const INSTANCE = "ComponentInstance";

/** Craft のノードの props。P0 の Node から id / type / children を除いたもの。 */
export interface NodeFields {
  /** P0 のノード id。新しく置いたノードで未設定なら保存時に付ける。 */
  nodeId?: string;
  props?: Record<string, JsonValue>;
  style?: Style;
  repeat?: Repeat;
  visible?: boolean | string;
  events?: Events;
}

/** コンポーネントのインスタンスの props。 */
export interface InstanceFields extends NodeFields {
  /** コンポーネント id（P0 の type）。 */
  component: string;
}

interface NodeCustom {
  /** canvas でないノードの子（Craft では扱わず、そのまま戻す）。 */
  p0Children?: Node[];
  /** P0 に `children` キーがあったか（空配列を保つため）。 */
  hasChildren?: boolean;
}

export const ROOT_ID = "ROOT";

export function isBuiltin(type: string): type is BuiltinNodeType {
  return (BUILTIN_NODE_TYPES as readonly string[]).includes(type);
}

/** 子を置けるノードか（Craft の canvas にするか）。 */
export function isContainerType(type: string): boolean {
  return type === "Box";
}

export function resolvedNameOf(node: Pick<SerializedNode, "type">): string {
  return typeof node.type === "string" ? node.type : node.type.resolvedName;
}

/** P0 のツリー → Craft のシリアライズ形式。ルートの Craft id は `ROOT`、それ以外は P0 の id を使う。 */
export function p0ToCraft(root: Node): SerializedNodes {
  const out: SerializedNodes = {};
  const used = new Set<string>([ROOT_ID]);

  const craftIdFor = (node: Node): string => {
    let id = node.id;
    for (let i = 2; used.has(id); i++) id = `${node.id}~${i}`;
    used.add(id);
    return id;
  };

  const visit = (node: Node, craftId: string, parent: string | null) => {
    const canvas = isContainerType(node.type);
    const custom: NodeCustom = {};
    if (node.children !== undefined) custom.hasChildren = true;
    const nodes: string[] = [];
    if (canvas) {
      for (const child of node.children ?? []) {
        const childId = craftIdFor(child);
        nodes.push(childId);
        visit(child, childId, craftId);
      }
    } else if (node.children !== undefined) {
      custom.p0Children = node.children;
    }
    out[craftId] = {
      type: { resolvedName: isBuiltin(node.type) ? node.type : INSTANCE },
      isCanvas: canvas,
      props: fieldsOf(node),
      displayName: node.type,
      custom,
      hidden: false,
      nodes,
      linkedNodes: {},
      parent,
    };
  };

  visit(root, ROOT_ID, null);
  return out;
}

function fieldsOf(node: Node): NodeFields | InstanceFields {
  const fields: InstanceFields = { component: node.type, nodeId: node.id };
  if (node.props !== undefined) fields.props = node.props;
  if (node.style !== undefined) fields.style = node.style;
  if (node.repeat !== undefined) fields.repeat = node.repeat;
  if (node.visible !== undefined) fields.visible = node.visible;
  if (node.events !== undefined) fields.events = node.events;
  if (isBuiltin(node.type)) delete (fields as Partial<InstanceFields>).component;
  return fields;
}

/** Craft のシリアライズ形式 → P0 のツリー。id が無い・重複しているノードには id を付ける。 */
export function craftToP0(nodes: SerializedNodes, rootId: string = ROOT_ID): Node {
  const build = (craftId: string): Node => {
    const craft = nodes[craftId];
    if (!craft) throw new Error(`Craft のノード ${craftId} がありません`);
    const fields = (craft.props ?? {}) as Partial<InstanceFields>;
    const resolved = resolvedNameOf(craft);
    const type = resolved === INSTANCE ? (fields.component ?? "") : resolved;
    const node: Node = { id: fields.nodeId ?? "", type };
    if (fields.props !== undefined) node.props = fields.props;
    if (fields.style !== undefined) node.style = fields.style;
    if (fields.repeat !== undefined) node.repeat = fields.repeat;
    if (fields.visible !== undefined) node.visible = fields.visible;
    if (fields.events !== undefined) node.events = fields.events;
    const custom = (craft.custom ?? {}) as NodeCustom;
    if (craft.isCanvas) {
      const children = craft.nodes.map(build);
      if (children.length > 0 || custom.hasChildren) node.children = children;
    } else if (custom.p0Children !== undefined) {
      node.children = custom.p0Children;
    }
    return node;
  };
  const root = build(rootId);
  assignMissingIds(root);
  return root;
}

/** 空の id・重複した id を `<type の先頭小文字><連番>` で埋める。先に出てきた方の id を残す。 */
export function assignMissingIds(root: Node): void {
  const all: Node[] = [];
  const walk = (n: Node) => {
    all.push(n);
    n.children?.forEach(walk);
  };
  walk(root);
  const used = new Set<string>();
  const needsId: Node[] = [];
  for (const n of all) {
    if (n.id !== "" && !used.has(n.id)) used.add(n.id);
    else needsId.push(n);
  }
  for (const n of needsId) n.id = uniqueNodeId(baseIdFor(n.type), used);
}

export function baseIdFor(type: string): string {
  return type.charAt(0).toLowerCase() + type.slice(1);
}

/** `used` に無い `<base><連番>` を返し、`used` に加える。 */
export function uniqueNodeId(base: string, used: Set<string>): string {
  let i = 1;
  while (used.has(`${base}${i}`)) i++;
  const id = `${base}${i}`;
  used.add(id);
  return id;
}
