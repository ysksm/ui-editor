import type { Component } from "@ui-editor/schema";
import { Handle, Position, type Node as RFNode, type NodeProps } from "@xyflow/react";
import { memo } from "react";
import { SCREEN_HANDLE, type FlowNodeInfo } from "../graph/extract";
import { Wireframe } from "./Wireframe";

export type ScreenNodeData = {
  info: FlowNodeInfo;
  path: string | undefined;
  entry: boolean;
  components: ReadonlyMap<string, Component>;
  triggerNodeIds: ReadonlySet<string>;
  /** 画面自体のイベント（mount）から出る遷移があるか */
  hasScreenTrigger: boolean;
};

export type ScreenFlowNode = RFNode<ScreenNodeData, "screen">;

function ScreenNodeView({ data }: NodeProps<ScreenFlowNode>) {
  const { info } = data;
  return (
    <div className={`screen-node screen-node-${info.kind}`}>
      <div className="screen-node-header">
        <Handle
          type="target"
          position={Position.Left}
          className="screen-target"
          isConnectable={false}
        />
        <span className="screen-node-kind">{info.kind === "screen" ? "画面" : "ダイアログ"}</span>
        <span className="screen-node-name">{info.name}</span>
        {data.entry && <span className="screen-node-entry">開始</span>}
        <span className="screen-node-id">{data.path ?? info.id}</span>
        {data.hasScreenTrigger && (
          <Handle
            type="source"
            id={SCREEN_HANDLE}
            position={Position.Right}
            className="wf-handle"
            isConnectable={false}
          />
        )}
      </div>
      <Wireframe
        root={info.root}
        components={data.components}
        triggerNodeIds={data.triggerNodeIds}
      />
    </div>
  );
}

export const ScreenNode = memo(ScreenNodeView);
