import {
  BaseEdge,
  EdgeLabelRenderer,
  getSmoothStepPath,
  type Edge,
  type EdgeProps,
} from "@xyflow/react";
import type { ErEdgeData } from "./graph";

export type ErFlowEdge = Edge<ErEdgeData, "er">;

/** 入れ子（実線）と参照（破線）の線。線端は IE 記法（markers.tsx）。 */
export function ErEdge(props: EdgeProps<ErFlowEdge>) {
  const { id, data, selected } = props;
  const [path, labelX, labelY] = getSmoothStepPath({
    sourceX: props.sourceX,
    sourceY: props.sourceY,
    sourcePosition: props.sourcePosition,
    targetX: props.targetX,
    targetY: props.targetY,
    targetPosition: props.targetPosition,
    borderRadius: 8,
    offset: 28,
  });
  if (!data) return null;
  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        markerStart={`url(#${data.start})`}
        markerEnd={`url(#${data.end})`}
        className={`er-edge er-edge-${data.kind}${selected ? " selected" : ""}`}
        interactionWidth={16}
      />
      <EdgeLabelRenderer>
        <div
          className={`er-edge-label er-edge-label-${data.kind}`}
          style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }}
        >
          {data.label}
        </div>
      </EdgeLabelRenderer>
    </>
  );
}
