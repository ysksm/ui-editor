import { formatIssue, validateProject, type Project } from "@ui-editor/schema";
import {
  Background,
  Controls,
  MarkerType,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  useNodesInitialized,
  useNodesState,
  useReactFlow,
  type Connection,
  type Edge,
  type EdgeChange,
  type FinalConnectionState,
  type NodeChange,
} from "@xyflow/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import exampleText from "../../../packages/schema/examples/device-monitor.project.json?raw";
import { EdgePanel } from "./EdgePanel";
import {
  download,
  openProjectFile,
  parseProjectFile,
  saveProjectFile,
  type LoadedProject,
} from "./files";
import {
  addTransition,
  isConnectablePart,
  moveTransitionToEvent,
  removeTransitions,
  setTransitionParams,
} from "./graph/edit";
import { extractFlow, sourceHandleOf, walkTree, type FlowGraph } from "./graph/extract";
import { autoLayout, mergePositions, type XY } from "./graph/layout";
import { parseLayout, serializeLayout } from "./graph/layout-file";
import { ScreenNode, type ScreenFlowNode, type ScreenNodeData } from "./nodes/ScreenNode";

/** `layouts/<name>.layout.json`（保存済みの手動配置位置） */
const savedLayouts = import.meta.glob<string>("../layouts/*.layout.json", {
  query: "?raw",
  import: "default",
  eager: true,
});

function savedPositions(name: string): Record<string, XY> {
  const text = savedLayouts[`../layouts/${name}.layout.json`];
  if (!text) return {};
  try {
    return parseLayout(text).positions;
  } catch {
    return {};
  }
}

const EXAMPLE = parseProjectFile("device-monitor.project.json", exampleText);

const nodeTypes = { screen: ScreenNode };

export function App() {
  const [loaded, setLoaded] = useState<LoadedProject>(EXAMPLE);
  const [openCount, setOpenCount] = useState(0);
  const [error, setError] = useState<string>();

  const onOpen = async () => {
    try {
      const next = await openProjectFile();
      if (!next) return;
      setLoaded(next);
      setOpenCount((n) => n + 1);
      setError(undefined);
    } catch (err) {
      setError(`読み込めません:\n${(err as Error).message}`);
    }
  };

  return (
    <div className="app">
      <ReactFlowProvider key={openCount}>
        <FlowEditor loaded={loaded} onOpen={() => void onOpen()} onError={setError} />
      </ReactFlowProvider>
      {error && (
        <pre className="app-error" onClick={() => setError(undefined)}>
          {error}
        </pre>
      )}
    </div>
  );
}

function FlowEditor({
  loaded: initialLoaded,
  onOpen,
  onError,
}: {
  loaded: LoadedProject;
  onOpen: () => void;
  onError: (message: string) => void;
}) {
  const [loaded, setLoaded] = useState(initialLoaded);
  const [project, setProject] = useState(initialLoaded.project);
  const { name } = loaded;
  const graph = useMemo(() => extractFlow(project), [project]);
  const [initialNodes] = useState(() => toFlowNodes(project, graph));
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string>();
  const edges = useMemo(() => toFlowEdges(graph, selectedEdgeId), [graph, selectedEdgeId]);
  const selected = graph.transitions.find((t) => t.id === selectedEdgeId);
  const issues = useMemo(() => {
    const r = validateProject(project);
    return r.success ? [] : r.issues;
  }, [project]);
  const initialized = useNodesInitialized();
  const { fitView, getNodes } = useReactFlow<ScreenFlowNode>();
  const [laidOut, setLaidOut] = useState(false);
  const [layoutDirty, setLayoutDirty] = useState(false);
  const [projectDirty, setProjectDirty] = useState(false);
  const [status, setStatus] = useState("");

  // 遷移の追加・削除でノードの中身（起点パーツ）が変わる。位置はそのまま
  useEffect(() => {
    const data = new Map(toFlowNodes(project, graph).map((n) => [n.id, n.data]));
    setNodes((ns) => ns.map((n) => ({ ...n, data: data.get(n.id) ?? n.data })));
  }, [project, graph, setNodes]);

  /** 編集を反映する。失敗したらプロジェクトは変えない。 */
  const edit = useCallback(
    (fn: (p: Project) => { project: Project; id?: string | undefined }) => {
      try {
        const result = fn(project);
        setProject(result.project);
        setSelectedEdgeId(result.id);
        setProjectDirty(true);
      } catch (e) {
        onError((e as Error).message);
      }
    },
    [project, onError],
  );

  /** 実際の大きさで自動配置し、保存済みの位置があればそちらを使う。 */
  const applyLayout = useCallback(
    (useSaved: boolean) => {
      const measured = getNodes().map((n) => ({
        id: n.id,
        size: { width: n.measured?.width ?? 300, height: n.measured?.height ?? 200 },
      }));
      const auto = autoLayout(measured, graph.transitions);
      const positions = mergePositions(
        measured.map((n) => n.id),
        auto,
        useSaved ? savedPositions(name) : {},
      );
      setNodes((ns) => ns.map((n) => ({ ...n, position: positions[n.id] ?? n.position })));
      setLaidOut(true);
      requestAnimationFrame(() => void fitView({ padding: 0.1 }));
    },
    [getNodes, graph, name, setNodes, fitView],
  );

  useEffect(() => {
    if (initialized && !laidOut) applyLayout(true);
  }, [initialized, laidOut, applyLayout]);

  const handleNodesChange = useCallback(
    (changes: NodeChange<ScreenFlowNode>[]) => {
      // 画面・ダイアログは遷移図からは消さない
      onNodesChange(changes.filter((c) => c.type !== "remove"));
      if (changes.some((c) => c.type === "position" && c.dragging === false)) setLayoutDirty(true);
    },
    [onNodesChange],
  );

  const handleEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      const removed = changes.flatMap((c) => (c.type === "remove" ? [c.id] : []));
      if (removed.length > 0) {
        const triggers = graph.transitions.filter((t) => removed.includes(t.id));
        edit((p) => ({
          project: removeTransitions(
            p,
            triggers.map((t) => t.trigger),
          ),
        }));
        return;
      }
      for (const c of changes) {
        if (c.type === "select") setSelectedEdgeId(c.selected ? c.id : undefined);
      }
    },
    [graph, edit],
  );

  const connect = useCallback(
    (source: string, sourceHandle: string | null | undefined, target: string) => {
      const owner = graph.nodes.find((n) => n.id === source);
      const to = graph.nodes.find((n) => n.id === target);
      if (!owner || !to || !sourceHandle?.startsWith("part:")) return;
      const nodeId = sourceHandle.slice("part:".length);
      edit((p) =>
        addTransition(
          p,
          { ownerKind: owner.kind, ownerId: owner.id, nodeId },
          { kind: to.kind, id: to.id },
        ),
      );
    },
    [graph, edit],
  );

  const onConnect = useCallback(
    (c: Connection) => connect(c.source, c.sourceHandle, c.target),
    [connect],
  );

  /** ハンドルではなく画面・ダイアログの上で離しても遷移を追加する。 */
  const onConnectEnd = useCallback(
    (event: MouseEvent | TouchEvent, state: FinalConnectionState) => {
      if (state.isValid || !state.fromNode || !state.fromHandle) return;
      const point = "changedTouches" in event ? event.changedTouches[0]! : event;
      const el = document.elementFromPoint(point.clientX, point.clientY);
      const target = el?.closest<HTMLElement>(".react-flow__node")?.dataset.id;
      if (target) connect(state.fromNode.id, state.fromHandle.id, target);
    },
    [connect],
  );

  const onAutoLayout = () => {
    applyLayout(false);
    setLayoutDirty(true);
  };

  const onSaveLayout = async () => {
    const positions = Object.fromEntries(nodes.map((n) => [n.id, n.position]));
    const text = serializeLayout(positions);
    try {
      const res = await fetch(`/api/layout?name=${encodeURIComponent(name)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: text,
      });
      if (!res.ok) throw new Error(await res.text());
      setStatus(`layouts/${name}.layout.json に保存しました`);
    } catch {
      // 開発サーバー以外（vite preview など）ではファイルとしてダウンロードする
      download(`${name}.layout.json`, text);
      setStatus(`${name}.layout.json をダウンロードしました`);
    }
    setLayoutDirty(false);
  };

  const onSaveProject = async () => {
    try {
      const result = await saveProjectFile(loaded, project);
      if (!result) return;
      if (result.handle) setLoaded((l) => ({ ...l, handle: result.handle }));
      setStatus(result.message);
      setProjectDirty(false);
    } catch (e) {
      onError(`保存できません:\n${(e as Error).message}`);
    }
  };

  return (
    <>
      <header className="toolbar">
        <strong>画面遷移図</strong>
        <span className="toolbar-project">{project.name}</span>
        <button type="button" className="toolbar-button" onClick={onOpen}>
          ファイルを開く
        </button>
        <button type="button" className="toolbar-button" onClick={() => void onSaveProject()}>
          プロジェクトを保存{projectDirty ? " *" : ""}
        </button>
        <span className="toolbar-sep" />
        <button type="button" className="toolbar-button" onClick={onAutoLayout}>
          自動レイアウト
        </button>
        <button type="button" className="toolbar-button" onClick={() => void onSaveLayout()}>
          配置を保存{layoutDirty ? " *" : ""}
        </button>
        <span
          className={`toolbar-validation${issues.length > 0 ? " has-issues" : ""}`}
          title={issues.map(formatIssue).join("\n")}
        >
          {issues.length === 0 ? "検証 OK" : `検証 ${issues.length} 件`}
        </span>
        <span className="toolbar-status">{status}</span>
        <span className="toolbar-legend">
          <span className="legend-navigate">── navigate</span>
          <span className="legend-dialog">- - openDialog</span>
        </span>
      </header>
      <div className="canvas" style={{ opacity: laidOut ? 1 : 0 }}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          onNodesChange={handleNodesChange}
          onEdgesChange={handleEdgesChange}
          onConnect={onConnect}
          onConnectEnd={onConnectEnd}
          deleteKeyCode={["Backspace", "Delete"]}
          minZoom={0.1}
          fitView
        >
          <Background />
          <Controls />
          <MiniMap pannable zoomable />
        </ReactFlow>
        {selected && (
          <EdgePanel
            key={selected.id}
            project={project}
            transition={selected}
            onChangeEvent={(event) =>
              edit((p) => moveTransitionToEvent(p, selected.trigger, event))
            }
            onChangeParams={(params) =>
              edit((p) => ({
                project: setTransitionParams(p, selected.trigger, params),
                id: selected.id,
              }))
            }
            onDelete={() => edit((p) => ({ project: removeTransitions(p, [selected.trigger]) }))}
            onClose={() => setSelectedEdgeId(undefined)}
          />
        )}
      </div>
      <p className="hint">
        パーツ右端の点から画面・ダイアログへドラッグで遷移を追加。線を選んで Delete で削除
      </p>
    </>
  );
}

function toFlowNodes(project: Project, graph: FlowGraph): ScreenFlowNode[] {
  const components = new Map((project.components ?? []).map((c) => [c.id, c]));
  const entry = project.entry ?? project.screens[0]?.id;
  const paths = new Map(project.screens.map((s) => [s.id, s.path]));
  return graph.nodes.map((info) => {
    const own = graph.transitions.filter((t) => t.source === info.id);
    const connectableNodeIds = new Set<string>();
    walkTree(info.root, (n) => {
      if (isConnectablePart(n)) connectableNodeIds.add(n.id);
    });
    const data: ScreenNodeData = {
      info,
      path: paths.get(info.id),
      entry: info.id === entry,
      components,
      triggerNodeIds: new Set(own.flatMap((t) => (t.trigger.nodeId ? [t.trigger.nodeId] : []))),
      connectableNodeIds,
      hasScreenTrigger: own.some((t) => t.trigger.nodeId === undefined),
    };
    return { id: info.id, type: "screen", position: { x: 0, y: 0 }, deletable: false, data };
  });
}

function toFlowEdges(graph: FlowGraph, selectedId: string | undefined): Edge[] {
  return graph.transitions.map((t) => ({
    id: t.id,
    source: t.source,
    sourceHandle: sourceHandleOf(t.trigger),
    target: t.target,
    label: t.trigger.event,
    className: `edge-${t.kind}`,
    markerEnd: { type: MarkerType.ArrowClosed },
    selected: t.id === selectedId,
    data: { transition: t },
  }));
}
