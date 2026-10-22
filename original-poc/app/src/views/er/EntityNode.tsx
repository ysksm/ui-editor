import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import { fieldTypeLabel, type ErNodeData } from "./graph";

export type EntityFlowNode = Node<ErNodeData, "entity">;

/** ER 図のエンティティ（名前・id・フィールドの一覧）。 */
export function EntityNode({ data, selected }: NodeProps<EntityFlowNode>) {
  const { entity, issueCount } = data;
  return (
    <div className={`er-node${selected ? " selected" : ""}`} data-entity={entity.id}>
      <Handle type="target" position={Position.Left} />
      <div className="er-node-head">
        <strong>{entity.name}</strong>
        <code>{entity.id}</code>
        {issueCount > 0 && (
          <span className="er-node-issues" title="検証の問題">
            ⚠ {issueCount}
          </span>
        )}
      </div>
      <ul className="er-node-fields">
        {entity.fields.map((f) => (
          <li key={f.id} className={`er-field er-field-${f.type}`}>
            <span className="er-field-id">
              {f.id === entity.primaryKey && <span className="pk">🔑</span>}
              {f.id}
              {f.required && <span className="required">*</span>}
            </span>
            <span className="er-field-type">{fieldTypeLabel(f)}</span>
          </li>
        ))}
      </ul>
      <Handle type="source" position={Position.Right} />
    </div>
  );
}
