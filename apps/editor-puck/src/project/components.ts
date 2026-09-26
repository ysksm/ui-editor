import type { Component, Dialog, Node, ParamDef, Project } from "@ui-editor/schema";
import { getTree, setTree, type Target } from "./targets.ts";

/**
 * コンポーネント・ダイアログを作る操作（P2-4）。どれもプロジェクトを受け取り、新しいプロジェクトを返す。
 */

export type OpResult = { ok: true; project: Project } | { ok: false; message: string };

const COMPONENT_NAME = /^[A-Z][A-Za-z0-9]*$/;
const ID = /^[A-Za-z][A-Za-z0-9_-]*$/;

function checkComponentId(
  project: Project,
  id: string,
  reserved: ReadonlySet<string>,
): string | undefined {
  if (!COMPONENT_NAME.test(id))
    return "コンポーネント名は PascalCase（英大文字で始まる英数字）で指定してください";
  if (reserved.has(id)) return `${id} は組み込みのパーツと同じ名前です`;
  if (project.components?.some((c) => c.id === id)) return `コンポーネント ${id} は既にあります`;
  return undefined;
}

export function createComponent(
  project: Project,
  id: string,
  name: string,
  reserved: ReadonlySet<string>,
): OpResult {
  const error = checkComponentId(project, id, reserved);
  if (error) return { ok: false, message: error };
  const component: Component = {
    id,
    ...(name ? { name } : {}),
    root: { id: "body", type: "Box", style: { display: "flex", flexDirection: "column", gap: 4 } },
  };
  return {
    ok: true,
    project: { ...project, components: [...(project.components ?? []), component] },
  };
}

export function createDialog(project: Project, id: string, name: string): OpResult {
  if (!ID.test(id))
    return { ok: false, message: "ダイアログの id は英字で始まる英数字・_・- で指定してください" };
  if (project.dialogs?.some((d) => d.id === id))
    return { ok: false, message: `ダイアログ ${id} は既にあります` };
  const dialog: Dialog = {
    id,
    name: name || id,
    root: {
      id: "body",
      type: "Box",
      style: { display: "flex", flexDirection: "column", gap: 16, padding: 24 },
    },
  };
  return { ok: true, project: { ...project, dialogs: [...(project.dialogs ?? []), dialog] } };
}

function findNode(root: Node, id: string): Node | undefined {
  if (root.id === id) return root;
  for (const child of root.children ?? []) {
    const found = findNode(child, id);
    if (found) return found;
  }
  return undefined;
}

function replaceNode(root: Node, id: string, next: Node): Node {
  if (root.id === id) return next;
  if (!root.children) return root;
  return { ...root, children: root.children.map((c) => replaceNode(c, id, next)) };
}

/**
 * 編集中のツリーのノード（とその子孫）をコンポーネントにし、元の場所をそのインスタンスに置き換える。
 * `repeat` / `visible` / `events` は「どこに・何回・どう置くか」なのでインスタンス側に残し、
 * 見た目（type / props / style / children）をコンポーネントの中身にする。
 * 中身の式が外側の変数（`device` など）を参照している場合は、props を定義して書き換える必要がある。
 */
export function extractComponent(
  project: Project,
  target: Target,
  nodeId: string,
  id: string,
  name: string,
  reserved: ReadonlySet<string>,
): OpResult {
  const error = checkComponentId(project, id, reserved);
  if (error) return { ok: false, message: error };
  const tree = getTree(project, target);
  const node = tree && findNode(tree, nodeId);
  if (!tree || !node) return { ok: false, message: "選択中のパーツが見つかりません" };

  const { repeat, visible, events, ...body } = node;
  const instance: Node = { id: node.id, type: id };
  if (repeat !== undefined) instance.repeat = repeat;
  if (visible !== undefined) instance.visible = visible;
  if (events !== undefined) instance.events = events;

  const component: Component = { id, ...(name ? { name } : {}), root: body };
  const next = setTree(project, target, replaceNode(tree, nodeId, instance));
  return { ok: true, project: { ...next, components: [...(next.components ?? []), component] } };
}

function usesType(node: Node, type: string): boolean {
  return node.type === type || (node.children ?? []).some((c) => usesType(c, type));
}

/**
 * コンポーネント `id` を編集するときにパレットから外すもの（自分自身と、自分を使っているコンポーネント）。
 * これらを中に置くと循環する。
 */
export function cyclicComponents(project: Project, id: string): Set<string> {
  const out = new Set([id]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const c of project.components ?? []) {
      if (out.has(c.id)) continue;
      if ([...out].some((used) => usesType(c.root, used))) {
        out.add(c.id);
        grew = true;
      }
    }
  }
  return out;
}

/** コンポーネントの props 定義、またはダイアログの params 定義。 */
export function getParams(project: Project, target: Target): Record<string, ParamDef> | undefined {
  if (target.kind === "component")
    return project.components?.find((c) => c.id === target.id)?.props;
  if (target.kind === "dialog") return project.dialogs?.find((d) => d.id === target.id)?.params;
  return project.screens.find((s) => s.id === target.id)?.params;
}

export function setParams(
  project: Project,
  target: Target,
  params: Record<string, ParamDef>,
): Project {
  const value = Object.keys(params).length > 0 ? params : undefined;
  if (target.kind === "component") {
    return {
      ...project,
      components: project.components?.map((c) => (c.id === target.id ? { ...c, props: value } : c)),
    };
  }
  if (target.kind === "dialog") {
    return {
      ...project,
      dialogs: project.dialogs?.map((d) => (d.id === target.id ? { ...d, params: value } : d)),
    };
  }
  return {
    ...project,
    screens: project.screens.map((s) => (s.id === target.id ? { ...s, params: value } : s)),
  };
}
