import { useEditor } from "@craftjs/core";
import { useState } from "react";
import { craftToP0, INSTANCE, ROOT_ID, type InstanceFields } from "../project/convert";
import { addDoc, checkNewDocId } from "../project/documents";
import { ComponentInstance } from "../parts/craft";
import { useWorkspace } from "./workspace";

/**
 * 選択中のノードに対するコンポーネントの操作。
 * - 選択したノード（とその子孫）をコンポーネントにして、元の場所をインスタンスに置き換える
 * - インスタンスなら、そのコンポーネントを開く
 */
export function ComponentActions({ nodeId }: { nodeId: string }) {
  const { project, updateProject, openDoc } = useWorkspace();
  const { actions, query, node } = useEditor((state) => ({ node: state.nodes[nodeId] }));
  const [id, setId] = useState("");
  const [error, setError] = useState<string>();
  if (!node) return null;

  if (node.data.name === INSTANCE) {
    const component = (node.data.props as InstanceFields).component;
    return (
      <div className="component-actions">
        <button type="button" onClick={() => openDoc({ kind: "component", id: component })}>
          {component} を開く
        </button>
      </div>
    );
  }

  const extract = () => {
    const componentId = id.trim();
    const problem = checkNewDocId(project, "component", componentId);
    if (problem) return setError(problem);
    const parent = node.data.parent;
    if (!parent) return;
    const root = craftToP0(query.getSerializedNodes(), nodeId);
    updateProject((p) => addDoc(p, "component", componentId, componentId, root));
    const index = query.node(parent).get().data.nodes.indexOf(nodeId);
    const tree = query
      .parseReactElement(<ComponentInstance nodeId={root.id} component={componentId} />)
      .toNodeTree();
    actions.delete(nodeId);
    actions.addNodeTree(tree, parent, index);
    actions.selectNode(tree.rootNodeId);
    setId("");
    setError(undefined);
  };

  if (nodeId === ROOT_ID) return null;
  return (
    <div className="component-actions">
      <input
        aria-label="コンポーネント id"
        placeholder="コンポーネント id（例: KpiCard）"
        value={id}
        onChange={(e) => setId(e.target.value)}
      />
      <button type="button" onClick={extract}>
        コンポーネント化
      </button>
      {error && <span className="field-error">{error}</span>}
    </div>
  );
}
