import { Editor, Frame, useEditor } from "@craftjs/core";
import type { Project } from "@ui-editor/schema";
import { useMemo, useRef, useState } from "react";
import { Layers } from "./editor/Layers";
import { Palette } from "./editor/Palette";
import { PropsPanel } from "./editor/PropsPanel";
import { craftToP0, p0ToCraft } from "./project/convert";
import {
  DOC_KIND_LABEL,
  findDoc,
  listDocs,
  replaceDocRoot,
  sameDoc,
  type DocKey,
} from "./project/documents";
import { resolver } from "./parts/craft";
import { baseScope, cx, defaultPropsOf, ProjectContext, ScopeContext } from "./parts/view";

export function App({ initialProject }: { initialProject: Project }) {
  const [project, setProject] = useState(initialProject);
  const [docKey, setDocKey] = useState<DocKey>({
    kind: "screen",
    id: initialProject.screens[0]!.id,
  });
  // onNodesChange は Editor の作成時に固定されるので、最新の値は ref 経由で読む
  const docKeyRef = useRef(docKey);
  docKeyRef.current = docKey;

  const [initialData] = useState(() => p0ToCraft(findDoc(initialProject, docKey)!.root));

  return (
    <ProjectContext.Provider value={project}>
      <Editor
        resolver={resolver}
        indicator={{ success: "#1976d2", error: "#d32f2f" }}
        onNodesChange={(query) => {
          // Craft の状態が変わるたびに、開いているドキュメントの root を P0 形式に戻して持つ
          const root = craftToP0(query.getSerializedNodes());
          setProject((p) => replaceDocRoot(p, docKeyRef.current, root));
        }}
      >
        <div className="app">
          <Toolbar
            project={project}
            docKey={docKey}
            onOpen={(key) => {
              docKeyRef.current = key;
              setDocKey(key);
            }}
          />
          <aside className="sidebar sidebar--left">
            <section>
              <h2 className="panel-title">パーツ</h2>
              <Palette />
            </section>
            <section>
              <h2 className="panel-title">レイヤー</h2>
              <Layers />
            </section>
          </aside>
          <main className="canvas-area">
            <CanvasFrame project={project} docKey={docKey}>
              <Frame data={initialData} />
            </CanvasFrame>
          </main>
          <aside className="sidebar sidebar--right">
            <h2 className="panel-title">プロパティ</h2>
            <PropsPanel />
          </aside>
        </div>
      </Editor>
    </ProjectContext.Provider>
  );
}

function Toolbar({
  project,
  docKey,
  onOpen,
}: {
  project: Project;
  docKey: DocKey;
  onOpen: (key: DocKey) => void;
}) {
  const { actions, canUndo, canRedo } = useEditor((_, q) => ({
    canUndo: q.history.canUndo(),
    canRedo: q.history.canRedo(),
  }));

  const open = (key: DocKey) => {
    if (sameDoc(key, docKey)) return;
    const doc = findDoc(project, key);
    if (!doc) return;
    onOpen(key);
    actions.history.ignore().deserialize(p0ToCraft(doc.root));
    actions.history.clear();
    actions.selectNode();
  };

  const docs = listDocs(project);
  return (
    <header className="toolbar">
      <strong className="toolbar-title">{project.name}</strong>
      <nav className="doc-tabs">
        {(["screen", "component", "dialog"] as const).map((kind) => {
          const ofKind = docs.filter((d) => d.key.kind === kind);
          if (ofKind.length === 0) return null;
          return (
            <span key={kind} className="doc-group">
              <span className="doc-group-label">{DOC_KIND_LABEL[kind]}</span>
              {ofKind.map((d) => (
                <button
                  key={d.key.id}
                  type="button"
                  className={cx("doc-tab", sameDoc(d.key, docKey) && "is-active")}
                  onClick={() => open(d.key)}
                >
                  {d.label}
                </button>
              ))}
            </span>
          );
        })}
      </nav>
      <span className="toolbar-actions">
        <button type="button" disabled={!canUndo} onClick={() => actions.history.undo()}>
          元に戻す
        </button>
        <button type="button" disabled={!canRedo} onClick={() => actions.history.redo()}>
          やり直す
        </button>
      </span>
    </header>
  );
}

/** 開いているドキュメントの種類に合わせてキャンバスの枠を変える。 */
function CanvasFrame({
  project,
  docKey,
  children,
}: {
  project: Project;
  docKey: DocKey;
  children: React.ReactNode;
}) {
  const scope = useMemo(() => {
    const base = baseScope(project);
    if (docKey.kind !== "component") return base;
    const def = project.components?.find((c) => c.id === docKey.id);
    return { ...base, props: defaultPropsOf(def?.props, project.dataModel.source) };
  }, [project, docKey]);
  return (
    <ScopeContext.Provider value={scope}>
      <div className={cx("canvas-frame", `canvas-frame--${docKey.kind}`)}>{children}</div>
    </ScopeContext.Provider>
  );
}
