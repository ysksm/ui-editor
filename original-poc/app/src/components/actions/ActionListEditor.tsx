import { ACTION_TYPES, ActionSchema, type Action, type Project } from "@ui-editor/poc-model";
import { useEffect, useState } from "react";
import { actionTemplate, describeAction } from "./describe";

const TYPE_LABELS: Record<Action["type"], string> = {
  navigate: "画面遷移（navigate）",
  openDialog: "ダイアログを開く（openDialog）",
  closeDialog: "ダイアログを閉じる（closeDialog）",
  back: "戻る（back）",
  setState: "state を変える（setState）",
  select: "選択を変える（select）",
  createRecord: "データを作成（createRecord）",
  updateRecord: "データを更新（updateRecord）",
  deleteRecord: "データを削除（deleteRecord）",
  setDraft: "下書きを変える（setDraft）",
  saveDraft: "下書きを保存（saveDraft）",
};

/**
 * アクション列の編集（付随アクション・部品のイベント）。行ごとに説明を出し、並べ替え・削除、
 * JSON での編集（スキーマで検証）、ひな形からの追加ができる。
 */
export function ActionListEditor({
  project,
  actions,
  onChange,
  highlight,
  label,
}: {
  project: Project;
  actions: readonly Action[];
  onChange: (actions: Action[]) => void;
  /** 強調する行（この遷移のアクション）。 */
  highlight?: number | undefined;
  label: string;
}) {
  const [editing, setEditing] = useState<number | null>(null);
  const move = (from: number, to: number) => {
    const next = [...actions];
    const [a] = next.splice(from, 1);
    next.splice(to, 0, a!);
    onChange(next);
    setEditing(null);
  };
  return (
    <div className="action-list" aria-label={label} role="group">
      <ol>
        {actions.map((a, i) => (
          <li key={i} className={i === highlight ? "highlight" : undefined}>
            <div className="action-row">
              <span className="action-summary">
                {i === highlight && <span className="this-transition">この遷移</span>}
                {describeAction(project, a)}
              </span>
              <span className="action-buttons">
                <button
                  className="link"
                  aria-label={`${i + 1} 番目を上へ`}
                  disabled={i === 0}
                  onClick={() => move(i, i - 1)}
                >
                  ↑
                </button>
                <button
                  className="link"
                  aria-label={`${i + 1} 番目を下へ`}
                  disabled={i === actions.length - 1}
                  onClick={() => move(i, i + 1)}
                >
                  ↓
                </button>
                <button
                  className="link"
                  aria-label={`${i + 1} 番目を編集`}
                  aria-pressed={editing === i}
                  onClick={() => setEditing(editing === i ? null : i)}
                >
                  ✎
                </button>
                <button
                  className="link"
                  aria-label={`${i + 1} 番目を削除`}
                  onClick={() => {
                    onChange(actions.filter((_, j) => j !== i));
                    setEditing(null);
                  }}
                >
                  ×
                </button>
              </span>
            </div>
            {editing === i && (
              <ActionJson
                action={a}
                onCommit={(next) => {
                  onChange(actions.map((x, j) => (j === i ? next : x)));
                  setEditing(null);
                }}
              />
            )}
          </li>
        ))}
      </ol>
      <select
        aria-label={`${label}に追加`}
        value=""
        onChange={(e) => {
          if (!e.target.value) return;
          onChange([...actions, actionTemplate(project, e.target.value as Action["type"])]);
          setEditing(actions.length);
        }}
      >
        <option value="">＋ アクションを追加…</option>
        {ACTION_TYPES.map((t) => (
          <option key={t} value={t}>
            {TYPE_LABELS[t]}
          </option>
        ))}
      </select>
    </div>
  );
}

/** アクションを JSON で直す。スキーマに合わなければ理由を出して確定しない。 */
function ActionJson({ action, onCommit }: { action: Action; onCommit: (a: Action) => void }) {
  const [text, setText] = useState(() => JSON.stringify(action, null, 2));
  const [error, setError] = useState<string | undefined>();
  useEffect(() => setText(JSON.stringify(action, null, 2)), [action]);
  const commit = () => {
    let value: unknown;
    try {
      value = JSON.parse(text);
    } catch (e) {
      setError(`JSON の構文エラー: ${(e as Error).message}`);
      return;
    }
    const r = ActionSchema.safeParse(value);
    if (!r.success) {
      setError(
        r.error.issues.map((i) => `${i.path.join(".") || "(全体)"}: ${i.message}`).join("\n"),
      );
      return;
    }
    setError(undefined);
    onCommit(r.data);
  };
  return (
    <div className="action-json">
      <textarea
        aria-label="アクションの JSON"
        rows={Math.min(12, text.split("\n").length + 1)}
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      {error && <pre className="field-error">{error}</pre>}
      <button onClick={commit}>確定</button>
    </div>
  );
}
