import { formatPath, type Severity } from "@ui-editor/poc-model";
import { useState } from "react";
import { issueTarget } from "../state/issue-target";
import { useEditor } from "../state/store";

/** 検証の問題の一覧（FR-PRJ-02）。行を選ぶと該当のビューを開く。 */
export function IssuesPanel() {
  const open = useEditor((s) => s.issuesOpen);
  const issues = useEditor((s) => s.issues);
  const project = useEditor((s) => s.project);
  const setView = useEditor((s) => s.setView);
  const select = useEditor((s) => s.select);
  const toggle = useEditor((s) => s.toggleIssues);
  const [filter, setFilter] = useState<Severity | "all">("all");
  if (!open) return null;
  const shown = issues.filter((i) => filter === "all" || i.severity === filter);
  return (
    <section className="issues-panel" aria-label="検証の結果">
      <div className="issues-head">
        <strong>検証の結果</strong>
        {(["all", "error", "warning"] as const).map((f) => (
          <button key={f} aria-pressed={filter === f} onClick={() => setFilter(f)}>
            {f === "all" ? "すべて" : f === "error" ? "エラー" : "警告"}
          </button>
        ))}
        <button className="link close" onClick={() => toggle(false)} aria-label="閉じる">
          ×
        </button>
      </div>
      {shown.length === 0 ? (
        <p className="muted">問題はありません</p>
      ) : (
        <ul className="issues-list">
          {shown.map((issue, i) => (
            <li key={i}>
              <button
                className={`issue issue-${issue.severity}`}
                onClick={() => {
                  const target = issueTarget(project, issue);
                  if (!target) return;
                  setView(target.view);
                  select(target.selection);
                }}
              >
                <span className="issue-mark">{issue.severity === "error" ? "エラー" : "警告"}</span>
                <code className="issue-path">{formatPath(issue.path) || "(root)"}</code>
                <span>{issue.message}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
