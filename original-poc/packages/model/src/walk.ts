import type { IssuePath } from "./issues.js";
import type { Action, Container, Node, OpenDialogAction, Project } from "./schema.js";

/** 画面・ダイアログ・ノード・アクションをたどる補助関数（検証・遷移の抽出・編集操作で使う）。 */

export type ContainerKind = "screen" | "dialog";

export interface ContainerRef {
  kind: ContainerKind;
  container: Container;
  index: number;
  /** `["screens", 0]` / `["dialogs", 1]` */
  path: IssuePath;
}

/** 画面 → ダイアログの順。 */
export function containers(project: Pick<Project, "screens" | "dialogs">): ContainerRef[] {
  return [
    ...project.screens.map((container, index) => ({
      kind: "screen" as const,
      container,
      index,
      path: ["screens", index],
    })),
    ...project.dialogs.map((container, index) => ({
      kind: "dialog" as const,
      container,
      index,
      path: ["dialogs", index],
    })),
  ];
}

export function findContainer(
  project: Pick<Project, "screens" | "dialogs">,
  id: string,
): ContainerRef | undefined {
  return containers(project).find((c) => c.container.id === id);
}

/** ノードの木を深さ優先（親 → 子）でたどる。 */
export function walkNodes(
  root: Node,
  path: IssuePath,
  visit: (node: Node, path: IssuePath, parent: Node | undefined) => void,
): void {
  const walk = (node: Node, p: IssuePath, parent: Node | undefined) => {
    visit(node, p, parent);
    node.children?.forEach((child, i) => walk(child, [...p, "children", i], node));
  };
  walk(root, path, undefined);
}

export function findNode(root: Node | undefined, id: string): Node | undefined {
  let found: Node | undefined;
  if (root) walkNodes(root, [], (n) => (found ??= n.id === id ? n : undefined));
  return found;
}

export interface ActionVisit {
  action: Action;
  /** アクションの場所。例: `["screens", 0, "root", "children", 1, "events", "click", 0]` */
  path: IssuePath;
  /** アクションが実行される画面・ダイアログ（onClose の中なら openDialog を書いた側）。 */
  container: ContainerRef;
  /** イベントを持つノード（画面の mount なら undefined）。 */
  node: Node | undefined;
  /** イベント名（画面を開いたときは "mount"）。 */
  event: string;
  /** openDialog の onClose の中なら、その openDialog と結果名。 */
  onClose: { openDialog: OpenDialogAction; result: string } | undefined;
}

/** すべてのアクションを、書かれている順にたどる（onClose の中も）。 */
export function walkActions(
  project: Pick<Project, "screens" | "dialogs">,
  visit: (v: ActionVisit) => void,
): void {
  const list = (
    actions: readonly Action[],
    path: IssuePath,
    base: Omit<ActionVisit, "action" | "path">,
  ) => {
    actions.forEach((action, i) => {
      const p = [...path, i];
      visit({ ...base, action, path: p });
      if (action.type === "openDialog") {
        for (const [result, inner] of Object.entries(action.onClose ?? {})) {
          list(inner, [...p, "onClose", result], {
            ...base,
            onClose: { openDialog: action, result },
          });
        }
      }
    });
  };
  for (const ref of containers(project)) {
    const c = ref.container;
    if ("events" in c && c.events?.mount) {
      list(c.events.mount, [...ref.path, "events", "mount"], {
        container: ref,
        node: undefined,
        event: "mount",
        onClose: undefined,
      });
    }
    if (c.root) {
      walkNodes(c.root, [...ref.path, "root"], (node, path) => {
        for (const [event, actions] of Object.entries(node.events ?? {})) {
          list(actions, [...path, "events", event], {
            container: ref,
            node,
            event,
            onClose: undefined,
          });
        }
      });
    }
  }
}
