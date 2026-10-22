import {
  addContainer,
  addTransition,
  findContainer,
  findTransition,
  setFlowPosition,
  setFlowPositions,
} from "@ui-editor/poc-model";
import {
  Background,
  Controls,
  MarkerType,
  ReactFlow,
  ReactFlowProvider,
  useNodesState,
  useReactFlow,
  type EdgeTypes,
  type NodeTypes,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useEffect, useMemo } from "react";
import { useEditor } from "../state/store";
import { ContainerList } from "./flow/ContainerList";
import { ContainerNode, type ContainerFlowNode } from "./flow/ContainerNode";
import { ContainerPanel } from "./flow/ContainerPanel";
import { flowAutoPositions, flowGraph, nextContainerPosition } from "./flow/graph";
import { TransitionEdge, type TransitionFlowEdge } from "./flow/TransitionEdge";
import { TransitionPanel } from "./flow/TransitionPanel";

const nodeTypes: NodeTypes = { container: ContainerNode };
const edgeTypes: EdgeTypes = { transition: TransitionEdge };

/** フロービュー（FR-FLOW）: 画面・ダイアログの一覧、フロー図、選んだもののパネル。 */
export function FlowView() {
  return (
    <ReactFlowProvider>
      <FlowEditor />
    </ReactFlowProvider>
  );
}

function FlowEditor() {
  const project = useEditor((s) => s.project);
  const issues = useEditor((s) => s.issues);
  const selection = useEditor((s) => s.selection);
  const edit = useEditor((s) => s.edit);
  const select = useEditor((s) => s.select);
  const { fitView } = useReactFlow();
  const selectedContainer = selection?.kind === "container" ? selection.id : undefined;
  const selectedTransition = selection?.kind === "transition" ? selection.key : undefined;
  const ref = selectedContainer ? findContainer(project, selectedContainer) : undefined;
  const transition = selectedTransition ? findTransition(project, selectedTransition) : undefined;

  const graph = useMemo(() => flowGraph(project, issues), [project, issues]);
  const derivedNodes = useMemo<ContainerFlowNode[]>(
    () =>
      graph.nodes.map((n) => ({
        id: n.id,
        type: "container",
        position: n.position,
        data: n.data,
        selected: n.id === selectedContainer,
      })),
    [graph, selectedContainer],
  );
  // ドラッグ中の位置はローカルに持ち、ドラッグ終了でプロジェクトに書く（履歴は 1 回だけ）
  const [nodes, setNodes, onNodesChange] = useNodesState<ContainerFlowNode>(derivedNodes);
  useEffect(() => setNodes(derivedNodes), [derivedNodes, setNodes]);
  const edges = useMemo<TransitionFlowEdge[]>(
    () =>
      graph.edges.map((e) => ({
        id: e.id,
        type: "transition",
        source: e.source,
        target: e.target,
        data: e.data,
        selected: e.id === selectedTransition,
        markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16 },
      })),
    [graph, selectedTransition],
  );

  const add = (kind: "screen" | "dialog") => {
    let id = "";
    const position = nextContainerPosition(project);
    if (
      edit(
        kind === "screen" ? "画面を追加" : "ダイアログを追加",
        (d) => void (id = addContainer(d, kind, { position })),
      )
    )
      select({ kind: "container", id });
  };

  return (
    <div className="flow-view">
      <div className="view-toolbar">
        <button className="primary" onClick={() => add("screen")}>
          ＋ 画面
        </button>
        <button className="primary" onClick={() => add("dialog")}>
          ＋ ダイアログ
        </button>
        <button
          onClick={() => {
            if (edit("フロー図を整列", (d) => setFlowPositions(d, flowAutoPositions(project))))
              requestAnimationFrame(
                () => void fitView({ padding: 0.2, maxZoom: 1, duration: 200 }),
              );
          }}
          disabled={project.screens.length + project.dialogs.length === 0}
        >
          整列
        </button>
        <span className="legend">
          <span>→ 画面遷移</span>
          <span>⇢ ダイアログの呼び出し（破線）</span>
          <span className="muted">
            ノードの右の点から別のノードへドラッグすると遷移（仮のボタン）を作れる
          </span>
        </span>
      </div>
      <div className="flow-body">
        <ContainerList project={project} selected={selectedContainer} />
        <div className="flow-canvas" aria-label="フロー図">
          <ReactFlow<ContainerFlowNode, TransitionFlowEdge>
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            onNodesChange={onNodesChange}
            onNodeDragStop={(_, node) =>
              edit("画面・ダイアログを移動", (d) => setFlowPosition(d, node.id, node.position))
            }
            onNodeClick={(_, node) => select({ kind: "container", id: node.id })}
            onEdgeClick={(_, edge) => select({ kind: "transition", key: edge.id })}
            onPaneClick={() => select(null)}
            onConnect={(c) => {
              if (!c.source || !c.target) return;
              let key = "";
              if (edit("遷移を追加", (d) => void (key = addTransition(d, c.source, c.target))))
                select({ kind: "transition", key });
            }}
            fitView
            fitViewOptions={{ padding: 0.2, maxZoom: 1 }}
            minZoom={0.2}
            deleteKeyCode={null}
            proOptions={{ hideAttribution: true }}
          >
            <Background gap={16} size={1} />
            <Controls showInteractive={false} />
          </ReactFlow>
          {project.screens.length + project.dialogs.length === 0 && (
            <p className="canvas-empty muted">「＋ 画面」「＋ ダイアログ」で作ってください</p>
          )}
        </div>
        {ref ? (
          <ContainerPanel key={ref.container.id} project={project} info={ref} />
        ) : transition ? (
          <TransitionPanel key={transition.key} project={project} transition={transition} />
        ) : (
          <aside className="inspector muted" aria-label="選んだものの編集">
            画面・ダイアログや遷移の線を選ぶと、ここで編集できます。
          </aside>
        )}
      </div>
    </div>
  );
}
