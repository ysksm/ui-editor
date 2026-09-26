import { useEditor } from "@craftjs/core";
import type { Project } from "@ui-editor/schema";
import { createContext, useContext, type ReactNode } from "react";
import { p0ToCraft } from "../project/convert";
import { findDoc, type DocKey } from "../project/documents";

/** エディタ全体の操作（Craft の外にあるプロジェクトの状態と、開くドキュメントの切り替え）。 */
export interface Workspace {
  project: Project;
  docKey: DocKey;
  /** ドキュメントを Craft に読み込む。`from` を渡すとそのプロジェクトから読む（更新直後に使う）。 */
  openDoc: (key: DocKey, from?: Project) => void;
  updateProject: (update: (p: Project) => Project) => void;
}

const WorkspaceContext = createContext<Workspace | null>(null);

export function useWorkspace(): Workspace {
  const ws = useContext(WorkspaceContext);
  if (!ws) throw new Error("WorkspaceProvider がありません");
  return ws;
}

/** `<Editor>` の中に置く（Craft の actions を使うため）。 */
export function WorkspaceProvider({
  project,
  docKey,
  onDocKeyChange,
  updateProject,
  children,
}: {
  project: Project;
  docKey: DocKey;
  /** 開くドキュメントが変わる直前（Craft に読み込む前）に呼ぶ。 */
  onDocKeyChange: (key: DocKey) => void;
  updateProject: Workspace["updateProject"];
  children: ReactNode;
}) {
  const { actions } = useEditor();
  const openDoc = (key: DocKey, from: Project = project) => {
    const doc = findDoc(from, key);
    if (!doc) return;
    onDocKeyChange(key);
    actions.history.ignore().deserialize(p0ToCraft(doc.root));
    actions.history.clear();
    actions.selectNode();
  };
  return (
    <WorkspaceContext.Provider value={{ project, docKey, openDoc, updateProject }}>
      {children}
    </WorkspaceContext.Provider>
  );
}
