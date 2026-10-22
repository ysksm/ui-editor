import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  type Edge,
  type EdgeProps,
} from "@xyflow/react";
import { useEditor } from "../../state/store";
import type { FlowEdgeData } from "./graph";

export type TransitionFlowEdge = Edge<FlowEdgeData, "transition">;

/** 遷移の線。ダイアログの呼び出し（openDialog）は破線、ダイアログを閉じた後の遷移は点線。 */
export function TransitionEdge(props: EdgeProps<TransitionFlowEdge>) {
  const { id, data, selected, markerEnd } = props;
  const select = useEditor((s) => s.select);
  const [path, labelX, labelY] = getBezierPath({
    sourceX: props.sourceX,
    sourceY: props.sourceY,
    sourcePosition: props.sourcePosition,
    targetX: props.targetX,
    targetY: props.targetY,
    targetPosition: props.targetPosition,
  });
  if (!data) return null;
  const t = data.transition;
  const cls = [
    "flow-edge",
    t.kind === "openDialog" ? "flow-edge-dialog" : "flow-edge-navigate",
    t.onClose ? "flow-edge-onclose" : "",
    selected ? "selected" : "",
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <>
      <BaseEdge id={id} path={path} markerEnd={markerEnd} className={cls} interactionWidth={18} />
      <EdgeLabelRenderer>
        <div
          className={`flow-edge-label${t.placeholder ? " placeholder" : ""}${selected ? " selected" : ""}`}
          style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }}
          title={t.placeholder ? "仮の部品のトリガー" : undefined}
          onClick={() => select({ kind: "transition", key: id })}
        >
          {data.label}
        </div>
      </EdgeLabelRenderer>
    </>
  );
}
