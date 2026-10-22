import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import type { FlowNodeData } from "./graph";

export type ContainerFlowNode = Node<FlowNodeData, "container">;

/** フロー図の画面・ダイアログ。 */
export function ContainerNode({ data, selected }: NodeProps<ContainerFlowNode>) {
  return (
    <div
      className={`flow-node flow-node-${data.kind}${selected ? " selected" : ""}`}
      data-container={data.id}
    >
      <Handle type="target" position={Position.Left} />
      <div className="flow-node-head">
        {data.entry && (
          <span className="entry-mark" title="最初の画面">
            ▶
          </span>
        )}
        <strong>{data.name}</strong>
        {data.issueCount > 0 && <span className="flow-node-issues">⚠ {data.issueCount}</span>}
      </div>
      <div className="flow-node-meta">
        <span className={`kind-badge kind-${data.kind}`}>
          {data.kind === "screen" ? "画面" : "ダイアログ"}
        </span>
        <code>{data.id}</code>
        {data.placeholders > 0 && <span className="placeholder-count">仮 {data.placeholders}</span>}
      </div>
      <Handle type="source" position={Position.Right} />
    </div>
  );
}
