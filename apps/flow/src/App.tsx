import { loadProject, formatFromPath, formatIssue, type Project } from "@ui-editor/schema";
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
  type Edge,
  type NodeChange,
} from "@xyflow/react";
import { useCallback, useEffect, useMemo, useState, type ChangeEvent } from "react";
import exampleText from "../../../packages/schema/examples/device-monitor.project.json?raw";
import { extractFlow, sourceHandleOf, type FlowGraph } from "./graph/extract";
import { autoLayout, mergePositions, type XY } from "./graph/layout";
import { parseLayout, serializeLayout } from "./graph/layout-file";
import { ScreenNode, type ScreenFlowNode } from "./nodes/ScreenNode";

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

interface Loaded {
  /** 配置ファイルの名前（プロジェクトファイル名から拡張子を除いたもの） */
  name: string;
  project: Project;
}

function loadText(fileName: string, text: string): Loaded {
  const result = loadProject(text, formatFromPath(fileName));
  if (!result.success) throw new Error(result.issues.map(formatIssue).join("\n"));
  const name = fileName
    .replace(/^.*[\\/]/, "")
    .replace(/(\.project)?\.(json|ya?ml)$/i, "")
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-");
  return { name, project: result.project };
}

const EXAMPLE = loadText("device-monitor.project.json", exampleText);

const nodeTypes = { screen: ScreenNode };

export function App() {
  const [loaded, setLoaded] = useState<Loaded>(EXAMPLE);
  const [error, setError] = useState<string>();

  const onOpen = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      setLoaded(loadText(file.name, await file.text()));
      setError(undefined);
    } catch (err) {
      setError(`${file.name} を読み込めません:\n${(err as Error).message}`);
    }
  };

  return (
    <div className="app">
      <ReactFlowProvider key={`${loaded.name}:${loaded.project.name}`}>
        <FlowEditor loaded={loaded} onOpen={onOpen} />
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
  loaded,
  onOpen,
}: {
  loaded: Loaded;
  onOpen: (e: ChangeEvent<HTMLInputElement>) => void;
}) {
  const { project, name } = loaded;
  const graph = useMemo(() => extractFlow(project), [project]);
  const initialNodes = useMemo(() => toFlowNodes(project, graph), [project, graph]);
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const edges = useMemo(() => toFlowEdges(graph), [graph]);
  const initialized = useNodesInitialized();
  const { fitView, getNodes } = useReactFlow<ScreenFlowNode>();
  const [laidOut, setLaidOut] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [status, setStatus] = useState("");

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
      onNodesChange(changes);
      if (changes.some((c) => c.type === "position" && c.dragging === false)) setDirty(true);
    },
    [onNodesChange],
  );

  const onAutoLayout = () => {
    applyLayout(false);
    setDirty(true);
  };

  const onSave = async () => {
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
    setDirty(false);
  };

  return (
    <>
      <header className="toolbar">
        <strong>画面遷移図</strong>
        <span className="toolbar-project">{project.name}</span>
        <label className="toolbar-button">
          ファイルを開く
          <input type="file" accept=".json,.yaml,.yml" onChange={onOpen} hidden />
        </label>
        <button type="button" className="toolbar-button" onClick={onAutoLayout}>
          自動レイアウト
        </button>
        <button type="button" className="toolbar-button" onClick={() => void onSave()}>
          配置を保存{dirty ? " *" : ""}
        </button>
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
          nodesConnectable={false}
          minZoom={0.1}
          fitView
        >
          <Background />
          <Controls />
          <MiniMap pannable zoomable />
        </ReactFlow>
      </div>
    </>
  );
}

function toFlowNodes(project: Project, graph: FlowGraph): ScreenFlowNode[] {
  const components = new Map((project.components ?? []).map((c) => [c.id, c]));
  const entry = project.entry ?? project.screens[0]?.id;
  const paths = new Map(project.screens.map((s) => [s.id, s.path]));
  return graph.nodes.map((info) => {
    const own = graph.transitions.filter((t) => t.source === info.id);
    return {
      id: info.id,
      type: "screen",
      position: { x: 0, y: 0 },
      data: {
        info,
        path: paths.get(info.id),
        entry: info.id === entry,
        components,
        triggerNodeIds: new Set(own.flatMap((t) => (t.trigger.nodeId ? [t.trigger.nodeId] : []))),
        hasScreenTrigger: own.some((t) => t.trigger.nodeId === undefined),
      },
    };
  });
}

function toFlowEdges(graph: FlowGraph): Edge[] {
  return graph.transitions.map((t) => ({
    id: t.id,
    source: t.source,
    sourceHandle: sourceHandleOf(t.trigger),
    target: t.target,
    label: t.trigger.event,
    className: `edge-${t.kind}`,
    markerEnd: { type: MarkerType.ArrowClosed },
    data: { transition: t },
  }));
}

function download(fileName: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}
