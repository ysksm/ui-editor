import { Editor, Frame } from "@craftjs/core";
import type { Project } from "@ui-editor/schema";
import { useMemo, useRef, useState } from "react";
import { Layers } from "./editor/Layers";
import { Palette } from "./editor/Palette";
import { PropsPanel } from "./editor/PropsPanel";
import { ResizeHandles } from "./editor/ResizeHandles";
import { Toolbar, type Message } from "./editor/Toolbar";
import { craftToP0, p0ToCraft } from "./project/convert";
import { findDoc, replaceDocRoot, type DocKey } from "./project/documents";
import { downloadText } from "./project/io";
import { resolver } from "./parts/craft";
import { baseScope, cx, defaultPropsOf, ProjectContext, ScopeContext } from "./parts/view";

export function App({
  initialProject,
  initialFilename = "project.json",
  onDownload = downloadText,
}: {
  initialProject: Project;
  initialFilename?: string;
  /** 保存したときの書き出し先（テストで差し替える）。 */
  onDownload?: (filename: string, text: string) => void;
}) {
  const [project, setProject] = useState(initialProject);
  const [filename, setFilename] = useState(initialFilename);
  const [message, setMessage] = useState<Message>();
  const [docKey, setDocKey] = useState<DocKey>({
    kind: "screen",
    id: initialProject.screens[0]!.id,
  });
  // onNodesChange は Editor の作成時に固定されるので、最新の値は ref 経由で読む
  const docKeyRef = useRef(docKey);
  const [canvasArea, setCanvasArea] = useState<HTMLElement | null>(null);
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
            filename={filename}
            docKey={docKey}
            onOpenDoc={(key) => {
              docKeyRef.current = key;
              setDocKey(key);
            }}
            onLoadProject={(p, name) => {
              setProject(p);
              setFilename(name);
            }}
            onDownload={onDownload}
            onMessage={setMessage}
          />
          {message && <MessageBar message={message} onClose={() => setMessage(undefined)} />}
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
          <main className="canvas-area" ref={setCanvasArea}>
            <CanvasFrame project={project} docKey={docKey}>
              <Frame data={initialData} />
            </CanvasFrame>
            <ResizeHandles container={canvasArea} />
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

function MessageBar({ message, onClose }: { message: Message; onClose: () => void }) {
  return (
    <div className={cx("message-bar", `message-bar--${message.kind}`)} role="status">
      <div className="message-bar__head">
        <strong>{message.title}</strong>
        <button type="button" onClick={onClose} aria-label="閉じる">
          ×
        </button>
      </div>
      {message.lines.length > 0 && (
        <ul>
          {message.lines.map((line, i) => (
            <li key={i}>{line}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
