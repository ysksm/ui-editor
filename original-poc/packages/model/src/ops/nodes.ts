import type { JsonValue, Project } from "../schema.js";
import { containers, findNode } from "../walk.js";

/**
 * ノードの編集操作（画面の中身の自由編集はステップ 6。ここでは props の書き換えだけ）。
 */

/** ノードの props を一部書き換える（undefined のキーは消す）。 */
export function updateNodeProps(
  draft: Project,
  containerId: string,
  nodeId: string,
  patch: Record<string, JsonValue | undefined>,
): void {
  const c = containers(draft).find((r) => r.container.id === containerId)?.container;
  const node = findNode(c?.root, nodeId);
  if (!node) throw new Error(`部品 "${nodeId}" がありません`);
  node.props ??= {};
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) delete node.props[k];
    else node.props[k] = v;
  }
  if (Object.keys(node.props).length === 0) delete node.props;
}
