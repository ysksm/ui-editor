import { useEffect, useState } from "react";
import { useFileActions } from "../state/file-actions";
import { useEditor } from "../state/store";

export function Header() {
  const name = useEditor((s) => s.project.name);
  const edit = useEditor((s) => s.edit);
  const file = useEditor((s) => s.file);
  const dirty = useEditor((s) => s.dirty);
  const past = useEditor((s) => s.history.past);
  const future = useEditor((s) => s.history.future);
  const undo = useEditor((s) => s.undo);
  const redo = useEditor((s) => s.redo);
  const issues = useEditor((s) => s.issues);
  const toggleIssues = useEditor((s) => s.toggleIssues);
  const previewOpen = useEditor((s) => s.previewOpen);
  const togglePreview = useEditor((s) => s.togglePreview);
  const actions = useFileActions();
  const [draftName, setDraftName] = useState(name);
  useEffect(() => setDraftName(name), [name]);

  const errors = issues.filter((i) => i.severity === "error").length;
  const warnings = issues.length - errors;
  const commitName = () => {
    const v = draftName.trim();
    if (v && v !== name) edit("プロジェクト名を変更", (d) => void (d.name = v));
    else setDraftName(name);
  };

  return (
    <header className="header">
      <span className="brand">Original PoC</span>
      <input
        className="project-name"
        aria-label="プロジェクト名"
        value={draftName}
        onChange={(e) => setDraftName(e.target.value)}
        onBlur={commitName}
        onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
      />
      <div className="toolbar" role="toolbar" aria-label="ファイル">
        <button onClick={actions.newProject}>新規</button>
        <button onClick={actions.open}>開く</button>
        <button onClick={actions.openExample}>題材を開く</button>
        <button onClick={() => void actions.save(false)}>保存</button>
        <button onClick={() => void actions.save(true)}>名前を付けて保存</button>
      </div>
      <div className="toolbar" role="toolbar" aria-label="履歴">
        <button
          onClick={undo}
          disabled={past.length === 0}
          title={past.length ? `元に戻す: ${past.at(-1)!.label}` : "元に戻す"}
        >
          ↶ 元に戻す
        </button>
        <button
          onClick={redo}
          disabled={future.length === 0}
          title={future.length ? `やり直す: ${future[0]!.label}` : "やり直す"}
        >
          ↷ やり直す
        </button>
      </div>
      <span className="file-name" title={file?.handle ? "上書き保存できます" : undefined}>
        {file?.name ?? "（未保存）"}
        {dirty && (
          <span className="dirty" aria-label="未保存の変更あり">
            {" "}
            ●
          </span>
        )}
      </span>
      <button className="preview-toggle" aria-pressed={previewOpen} onClick={() => togglePreview()}>
        ▶ プレビュー
      </button>
      <button
        className={`issues-badge ${errors ? "has-errors" : warnings ? "has-warnings" : ""}`}
        onClick={() => toggleIssues()}
        aria-label={`検証: エラー ${errors} 件・警告 ${warnings} 件`}
      >
        エラー {errors}・警告 {warnings}
      </button>
    </header>
  );
}
