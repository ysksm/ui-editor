import { nestParents } from "../er.js";
import {
  ID_PATTERN,
  type BuiltinNodeType,
  type Container,
  type JsonValue,
  type Node,
  type Project,
} from "../schema.js";
import { containers, findNode, walkNodes } from "../walk.js";
import { lowerFirst, numberedId } from "./ids.js";

/**
 * ノード（画面の中身の部品）の編集操作（ステップ 6・FR-UI-01）。
 * 子を持てるのは Box だけ。ノード id は画面・ダイアログの中で一意。
 */

function containerOf(draft: Project, id: string): Container {
  const c = containers(draft).find((r) => r.container.id === id)?.container;
  if (!c) throw new Error(`画面・ダイアログ "${id}" がありません`);
  return c;
}

function nodeOf(c: Container, id: string): Node {
  const n = findNode(c.root, id);
  if (!n) throw new Error(`部品 "${id}" がありません`);
  return n;
}

/** 親のノード（root なら undefined）。 */
export function parentOf(root: Node | undefined, id: string): Node | undefined {
  let found: Node | undefined;
  if (root)
    walkNodes(root, [], (n) => (found ??= n.children?.some((c) => c.id === id) ? n : undefined));
  return found;
}

function ids(c: Container): string[] {
  const out: string[] = [];
  if (c.root) walkNodes(c.root, [], (n) => out.push(n.id));
  return out;
}

/** 部品のパレットの初期値（文言は日本語、式は空の配列など）。 */
export const NODE_DEFAULTS: Record<BuiltinNodeType, Omit<Node, "id" | "type">> = {
  Box: { props: { direction: "column", gap: 8 }, children: [] },
  Text: { props: { text: "テキスト" } },
  Button: { props: { label: "ボタン" } },
  TextInput: { props: { label: "入力", value: "" } },
  NumberInput: { props: { label: "数値", value: 0 } },
  Checkbox: { props: { label: "チェック", checked: false } },
  Select: { props: { label: "選択", value: "", options: [] } },
  Table: { props: { rows: "{{ [] }}", columns: [] } },
};

/** ノード id として使えない理由（使えるなら undefined）。 */
export function nodeIdProblem(c: Container, id: string, self?: string): string | undefined {
  if (!ID_PATTERN.test(id)) return "英字で始まる英数字（_ と - も可）にしてください";
  if (id !== self && ids(c).includes(id)) return `"${id}" は既にあります`;
  return undefined;
}

/**
 * 部品を足し、id を返す。`parent` は Box の id（省略すると root。root が無ければ縦並びの Box を作る）。
 * root が Box でなければ Box で包んでから足す。
 */
export function addNode(
  draft: Project,
  containerId: string,
  type: BuiltinNodeType,
  options: { parent?: string | undefined; index?: number | undefined; id?: string } = {},
): string {
  const c = containerOf(draft, containerId);
  if (!c.root)
    c.root = { id: "page", type: "Box", props: { direction: "column", gap: 12 }, children: [] };
  if (!options.parent && c.root.type !== "Box") {
    const taken = ids(c);
    c.root = {
      id: numberedId("box", taken),
      type: "Box",
      props: { direction: "column", gap: 12 },
      children: [c.root],
    };
  }
  const parent = options.parent ? nodeOf(c, options.parent) : c.root;
  if (parent.type !== "Box") throw new Error("子を持てるのは Box だけです");
  const id = options.id ?? numberedId(lowerFirst(type), ids(c));
  const problem = nodeIdProblem(c, id);
  if (problem) throw new Error(problem);
  parent.children ??= [];
  const node: Node = { id, type, ...structuredClone(NODE_DEFAULTS[type]) };
  const at = options.index ?? parent.children.length;
  parent.children.splice(Math.max(0, Math.min(at, parent.children.length)), 0, node);
  return id;
}

/** 部品を消す（子ごと）。root を消すと中身が無くなる。 */
export function removeNode(draft: Project, containerId: string, nodeId: string): void {
  const c = containerOf(draft, containerId);
  if (c.root?.id === nodeId) {
    delete c.root;
    return;
  }
  const parent = parentOf(c.root, nodeId);
  if (!parent) throw new Error(`部品 "${nodeId}" がありません`);
  parent.children = parent.children!.filter((n) => n.id !== nodeId);
}

/** 兄弟の中で前（-1）・後ろ（+1）へ動かす。 */
export function moveNode(draft: Project, containerId: string, nodeId: string, step: -1 | 1): void {
  const c = containerOf(draft, containerId);
  const parent = parentOf(c.root, nodeId);
  if (!parent?.children) return;
  const i = parent.children.findIndex((n) => n.id === nodeId);
  const j = i + step;
  if (j < 0 || j >= parent.children.length) return;
  const [n] = parent.children.splice(i, 1);
  parent.children.splice(j, 0, n!);
}

/** 別の Box の中（末尾、または index の位置）へ移す。自分の子孫には移せない。 */
export function moveNodeInto(
  draft: Project,
  containerId: string,
  nodeId: string,
  parentId: string,
  index?: number,
): void {
  const c = containerOf(draft, containerId);
  const node = nodeOf(c, nodeId);
  const target = nodeOf(c, parentId);
  if (target.type !== "Box") throw new Error("子を持てるのは Box だけです");
  if (findNode(node, parentId)) throw new Error("自分の中には移せません");
  const from = parentOf(c.root, nodeId);
  if (!from) throw new Error("root は移せません");
  from.children = from.children!.filter((n) => n.id !== nodeId);
  target.children ??= [];
  target.children.splice(index ?? target.children.length, 0, node);
}

/** 部品の id を変える（遷移の key は id から導くので、ほかに書き換えるところは無い）。 */
export function renameNodeId(
  draft: Project,
  containerId: string,
  oldId: string,
  newId: string,
): void {
  if (oldId === newId) return;
  const c = containerOf(draft, containerId);
  const problem = nodeIdProblem(c, newId, oldId);
  if (problem) throw new Error(problem);
  nodeOf(c, oldId).id = newId;
}

/**
 * 部品を変える。props は一部だけ書き換える（undefined のキーは消す）。
 * visible / events は置き換える（undefined なら消す）。placeholder: false で本物の部品にする。
 */
export function updateNode(
  draft: Project,
  containerId: string,
  nodeId: string,
  patch: {
    props?: Record<string, JsonValue | undefined>;
    visible?: boolean | string | undefined;
    events?: Node["events"];
    placeholder?: boolean;
  },
): void {
  const node = nodeOf(containerOf(draft, containerId), nodeId);
  if (patch.props) {
    node.props ??= {};
    for (const [k, v] of Object.entries(patch.props)) {
      if (v === undefined) delete node.props[k];
      else node.props[k] = v;
    }
    if (Object.keys(node.props).length === 0) delete node.props;
  }
  if ("visible" in patch) {
    if (patch.visible === undefined || patch.visible === "") delete node.visible;
    else node.visible = patch.visible;
  }
  if ("events" in patch) {
    const events = Object.fromEntries(
      Object.entries(patch.events ?? {}).filter(([, a]) => a.length > 0),
    );
    if (Object.keys(events).length) node.events = events;
    else delete node.events;
  }
  if (patch.placeholder === false) delete node.placeholder;
}

/** ノードの props を一部書き換える（undefined のキーは消す）。 */
export function updateNodeProps(
  draft: Project,
  containerId: string,
  nodeId: string,
  patch: Record<string, JsonValue | undefined>,
): void {
  updateNode(draft, containerId, nodeId, { props: patch });
}

// ---- バインディングの候補（FR-UI-02） ----

/**
 * その画面・ダイアログで使える式の候補（`{{ … }}` の形）。
 * data・record・params・draft / errors（フォーム）・state・選択中のレコード、表の中なら row。
 */
export function bindingCandidates(
  project: Project,
  containerId: string,
  options: { tableEntity?: string | undefined } = {},
): string[] {
  const c = containers(project).find((r) => r.container.id === containerId)?.container;
  const out: string[] = [];
  const entities = new Map(project.entities.map((e) => [e.id, e]));
  const valueFields = (id: string | undefined) =>
    (id ? entities.get(id)?.fields : undefined)?.filter((f) => f.type !== "children") ?? [];
  const childFields = (id: string | undefined) =>
    (id ? entities.get(id)?.fields : undefined)?.filter((f) => f.type === "children") ?? [];
  if (options.tableEntity)
    for (const f of valueFields(options.tableEntity)) out.push(`{{ row.${f.id} }}`);
  if (c?.entity && c.kind !== "list") {
    for (const f of valueFields(c.entity)) out.push(`{{ record?.${f.id} }}`);
    for (const f of childFields(c.entity)) out.push(`{{ record?.${f.id} ?? [] }}`);
  }
  if (c?.kind === "form" && c.entity) {
    for (const f of valueFields(c.entity)) out.push(`{{ draft.${f.id} }}`, `{{ errors.${f.id} }}`);
  }
  for (const name of Object.keys(c?.params ?? {})) out.push(`{{ params.${name} }}`);
  const nest = nestParents(project.entities);
  for (const e of project.entities) {
    out.push(`{{ data.${e.id} }}`);
    if (!nest.has(e.id)) out.push(`{{ data.${e.id}.length }}`);
  }
  for (const k of Object.keys(project.state)) out.push(`{{ state.${k} }}`);
  for (const e of project.entities) {
    for (const f of valueFields(e.id)) out.push(`{{ state.selection.${e.id}?.${f.id} }}`);
  }
  return [...new Set(out)];
}
