import type { IssuePath } from "./issues.js";
import type { Params, Project } from "./schema.js";
import { walkActions, type ContainerKind } from "./walk.js";

/**
 * 遷移（D1 の案 b）。正はノードのイベントの navigate / openDialog（画面の mount、onClose の中も）で、
 * フロー図はここから線を作る。`key` は導くだけで、ファイルには保存しない（architecture.md 4.3）。
 */
export interface Transition {
  /** `<遷移元>:<ノード id>:<イベント>:<アクションの位置>`（mount はノード id が空）。 */
  key: string;
  /** 遷移元（アクションが実行される画面・ダイアログ。onClose の中なら openDialog を書いた側）。 */
  from: string;
  fromKind: ContainerKind;
  to: string;
  kind: "navigate" | "openDialog";
  /** トリガーの部品（mount なら undefined）。 */
  node: string | undefined;
  nodeType: string | undefined;
  /** イベント名（click / rowClick / mount など）。 */
  event: string;
  /** 部品の文言（Button の label・Text の text）。 */
  label: string | undefined;
  /** トリガーの部品が仮の部品か。 */
  placeholder: boolean;
  /** openDialog の onClose の中なら、そのダイアログと結果名。 */
  onClose: { dialog: string; result: string } | undefined;
  params: Params | undefined;
  /** アクションの場所。 */
  path: IssuePath;
}

/** プロジェクトのすべての遷移を、書かれている順に返す。 */
export function extractTransitions(project: Pick<Project, "screens" | "dialogs">): Transition[] {
  const out: Transition[] = [];
  walkActions(project, ({ action, path, container, node, event, onClose }) => {
    if (action.type !== "navigate" && action.type !== "openDialog") return;
    // アクションの位置: イベントの配列の中の番号（onClose の中なら openDialog の位置からの経路）
    const at = path.slice(path.lastIndexOf(event) + 1).join("/");
    const label = node?.props?.label ?? node?.props?.text;
    out.push({
      key: `${container.container.id}:${node?.id ?? ""}:${event}:${at}`,
      from: container.container.id,
      fromKind: container.kind,
      to: action.type === "navigate" ? action.to : action.dialog,
      kind: action.type,
      node: node?.id,
      nodeType: node?.type,
      event,
      label: typeof label === "string" ? label : undefined,
      placeholder: node?.placeholder === true,
      onClose: onClose && { dialog: onClose.openDialog.dialog, result: onClose.result },
      params: action.params,
      path,
    });
  });
  return out;
}

export function findTransition(
  project: Pick<Project, "screens" | "dialogs">,
  key: string,
): Transition | undefined {
  return extractTransitions(project).find((t) => t.key === key);
}
