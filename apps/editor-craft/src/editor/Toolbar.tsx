import { useEditor } from "@craftjs/core";
import type { Project, ProjectFormat } from "@ui-editor/schema";
import { useRef } from "react";
import { DOC_KIND_LABEL, listDocs, sameDoc } from "../project/documents";
import { baseNameOf, exportProject, importProject } from "../project/io";
import { cx } from "../parts/view";
import { useWorkspace } from "./workspace";

export interface Message {
  kind: "info" | "error";
  title: string;
  lines: string[];
}

export function Toolbar({
  filename,
  onLoadProject,
  onDownload,
  onMessage,
}: {
  filename: string;
  onLoadProject: (project: Project, filename: string) => void;
  onDownload: (filename: string, text: string) => void;
  onMessage: (message: Message | undefined) => void;
}) {
  const { actions, canUndo, canRedo } = useEditor((_, q) => ({
    canUndo: q.history.canUndo(),
    canRedo: q.history.canRedo(),
  }));
  const { project, docKey, openDoc } = useWorkspace();
  const fileInput = useRef<HTMLInputElement>(null);

  const openFile = async (file: File) => {
    const result = importProject(await file.text(), file.name);
    if (!result.ok) {
      onMessage({ kind: "error", title: `${file.name} を読み込めません`, lines: result.errors });
      return;
    }
    onLoadProject(result.project, file.name);
    openDoc({ kind: "screen", id: result.project.screens[0]!.id }, result.project);
    onMessage({ kind: "info", title: `${file.name} を読み込みました`, lines: [] });
  };

  const save = (format: ProjectFormat) => {
    const result = exportProject(project, format, baseNameOf(filename));
    onDownload(result.filename, result.text);
    onMessage(
      result.issues.length > 0
        ? {
            kind: "error",
            title: `${result.filename} を保存しました（検証の問題 ${result.issues.length} 件）`,
            lines: result.issues,
          }
        : { kind: "info", title: `${result.filename} を保存しました`, lines: [] },
    );
  };

  const docs = listDocs(project);
  return (
    <header className="toolbar">
      <span className="toolbar-file">
        <strong className="toolbar-title">{project.name}</strong>
        <span className="toolbar-filename">{filename}</span>
      </span>
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
                  onClick={() => !sameDoc(d.key, docKey) && openDoc(d.key)}
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
        <button type="button" onClick={() => fileInput.current?.click()}>
          開く
        </button>
        <input
          ref={fileInput}
          type="file"
          accept=".json,.yaml,.yml"
          hidden
          aria-label="プロジェクトファイル"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) void openFile(file);
          }}
        />
        <button type="button" onClick={() => save("json")}>
          JSON で保存
        </button>
        <button type="button" onClick={() => save("yaml")}>
          YAML で保存
        </button>
      </span>
    </header>
  );
}
