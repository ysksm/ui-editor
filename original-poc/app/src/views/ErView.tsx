import {
  addEntity,
  addRelation,
  relationDataLoss,
  setEntityPosition,
  setErPositions,
  type RelationKind,
} from "@ui-editor/poc-model";
import {
  Background,
  Controls,
  ReactFlow,
  ReactFlowProvider,
  useNodesState,
  type Connection,
  type EdgeTypes,
  type NodeTypes,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useEffect, useMemo, useState } from "react";
import { useEditor } from "../state/store";
import { EntityNode, type EntityFlowNode } from "./er/EntityNode";
import { EntityPanel } from "./er/EntityPanel";
import { ErEdge, type ErFlowEdge } from "./er/ErEdge";
import { erAutoPositions, erGraph, nextEntityPosition } from "./er/graph";
import { IeMarkers } from "./er/markers";
import { RelationDialog } from "./er/RelationDialog";

const nodeTypes: NodeTypes = { entity: EntityNode };
const edgeTypes: EdgeTypes = { er: ErEdge };

/** ER 図（FR-ER-01〜03）。エンティティを選ぶと右のパネルで編集する。 */
export function ErView() {
  return (
    <ReactFlowProvider>
      <ErCanvas />
    </ReactFlowProvider>
  );
}

function ErCanvas() {
  const project = useEditor((s) => s.project);
  const issues = useEditor((s) => s.issues);
  const selection = useEditor((s) => s.selection);
  const edit = useEditor((s) => s.edit);
  const select = useEditor((s) => s.select);
  const requestConfirm = useEditor((s) => s.requestConfirm);
  const [pending, setPending] = useState<{ from: string; to: string } | null>(null);

  const graph = useMemo(() => erGraph(project, issues), [project, issues]);
  const selectedEntity = selection?.kind === "entity" ? selection.id : undefined;
  const selectedField = selection?.kind === "entity" ? selection.field : undefined;

  const derivedNodes = useMemo<EntityFlowNode[]>(
    () =>
      graph.nodes.map((n) => ({
        id: n.id,
        type: "entity",
        position: n.position,
        data: n.data,
        selected: n.id === selectedEntity,
      })),
    [graph, selectedEntity],
  );
  // ドラッグ中の位置はローカルに持ち、ドラッグ終了でプロジェクトに書く（履歴は 1 回だけ）
  const [nodes, setNodes, onNodesChange] = useNodesState<EntityFlowNode>(derivedNodes);
  useEffect(() => setNodes(derivedNodes), [derivedNodes, setNodes]);

  const edges = useMemo<ErFlowEdge[]>(
    () =>
      graph.edges.map((e) => ({
        id: e.id,
        type: "er",
        source: e.source,
        target: e.target,
        data: e.data,
        selected: selectedEntity === e.data.entity && selectedField === e.data.field,
      })),
    [graph, selectedEntity, selectedField],
  );

  const entity = project.entities.find((e) => e.id === selectedEntity);

  const connect = (from: string, to: string, kind: RelationKind) => {
    setPending(null);
    const run = () => {
      let created = { entity: "", field: "" };
      if (edit("関係を追加", (d) => void (created = addRelation(d, from, to, kind))))
        select({ kind: "entity", id: created.entity, field: created.field });
    };
    const loss = relationDataLoss(project, to, kind);
    if (loss > 0)
      requestConfirm(
        `${to} のデータ ${loss} 件は消えます（親の中に移せないため）。続けますか？`,
        "続ける",
        run,
      );
    else run();
  };

  return (
    <div className="er-view">
      <div className="view-toolbar">
        <button
          className="primary"
          onClick={() => {
            let id = "";
            if (
              edit(
                "エンティティを追加",
                (d) => void (id = addEntity(d, { position: nextEntityPosition(project) })),
              )
            )
              select({ kind: "entity", id });
          }}
        >
          ＋ エンティティ
        </button>
        <button
          onClick={() => edit("ER 図を整列", (d) => setErPositions(d, erAutoPositions(project)))}
          disabled={project.entities.length === 0}
        >
          整列
        </button>
        <span className="legend">
          <span className="legend-nest">― 入れ子（親の中に子を持つ）</span>
          <span className="legend-ref">- - 参照（外部キー）</span>
          <span className="muted">ノードの右の点から別のノードへドラッグすると関係を作れる</span>
        </span>
      </div>
      <div className="er-body">
        <div className="er-canvas" aria-label="ER 図">
          <IeMarkers />
          <ReactFlow<EntityFlowNode, ErFlowEdge>
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            onNodesChange={onNodesChange}
            onNodeDragStop={(_, node) =>
              edit("エンティティを移動", (d) => setEntityPosition(d, node.id, node.position))
            }
            onNodeClick={(_, node) => select({ kind: "entity", id: node.id })}
            onEdgeClick={(_, edge) =>
              edge.data && select({ kind: "entity", id: edge.data.entity, field: edge.data.field })
            }
            onPaneClick={() => select(null)}
            onConnect={(c: Connection) =>
              c.source &&
              c.target &&
              c.source !== c.target &&
              setPending({ from: c.source, to: c.target })
            }
            fitView
            fitViewOptions={{ padding: 0.2, maxZoom: 1 }}
            minZoom={0.2}
            deleteKeyCode={null}
            proOptions={{ hideAttribution: true }}
          >
            <Background gap={16} size={1} />
            <Controls showInteractive={false} />
          </ReactFlow>
          {project.entities.length === 0 && (
            <p className="canvas-empty muted">「＋ エンティティ」でエンティティを作ってください</p>
          )}
        </div>
        {entity ? (
          <EntityPanel key={entity.id} entity={entity} selectedField={selectedField} />
        ) : (
          <aside className="inspector muted" aria-label="エンティティの編集">
            エンティティを選ぶと、ここで名前・属性・関係を編集できます。
          </aside>
        )}
      </div>
      {pending && (
        <RelationDialog
          from={pending.from}
          to={pending.to}
          onChoose={(kind) => connect(pending.from, pending.to, kind)}
          onCancel={() => setPending(null)}
        />
      )}
    </div>
  );
}
