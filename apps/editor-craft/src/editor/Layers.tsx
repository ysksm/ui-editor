import { useEditor, type Node as CraftNode } from "@craftjs/core";
import { INSTANCE, ROOT_ID, type InstanceFields } from "../project/convert";
import { cx } from "../parts/view";

/** Craft のノードの表示名（P0 の type とノード id）。 */
export function nodeLabel(node: CraftNode): { type: string; id: string } {
  const fields = node.data.props as Partial<InstanceFields>;
  const type = node.data.name === INSTANCE ? (fields.component ?? "?") : node.data.displayName;
  return { type, id: fields.nodeId ?? "（未設定）" };
}

/** レイヤーツリー（Craft のノードツリーをそのまま表示）。 */
export function Layers() {
  const { nodes, selected, actions } = useEditor((state) => ({
    nodes: state.nodes,
    selected: [...state.events.selected][0],
  }));

  const row = (id: string, depth: number): React.ReactNode => {
    const node = nodes[id];
    if (!node) return null;
    const { type, id: nodeId } = nodeLabel(node);
    const fields = node.data.props as Partial<InstanceFields>;
    return (
      <li key={id}>
        <button
          type="button"
          className={cx("layer-row", id === selected && "is-selected")}
          style={{ paddingLeft: 8 + depth * 14 }}
          onClick={() => actions.selectNode(id)}
        >
          <span className="layer-type">{type}</span>
          <span className="layer-id">{nodeId}</span>
          {fields.repeat && <span className="layer-flag">repeat</span>}
          {fields.visible !== undefined && <span className="layer-flag">visible</span>}
          {fields.events && <span className="layer-flag">events</span>}
        </button>
        {node.data.nodes.length > 0 && <ul>{node.data.nodes.map((c) => row(c, depth + 1))}</ul>}
      </li>
    );
  };

  return <ul className="layers">{row(ROOT_ID, 0)}</ul>;
}
