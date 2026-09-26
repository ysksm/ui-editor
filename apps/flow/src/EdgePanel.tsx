import type { JsonValue, Project } from "@ui-editor/schema";
import { useState } from "react";
import {
  eventsForType,
  findTransitionAction,
  targetParamDefs,
  triggerNodeType,
} from "./graph/edit";
import type { Transition } from "./graph/extract";

/** 選んだ遷移の詳細。イベントの付け替え・params の編集・削除ができる。 */
export function EdgePanel({
  project,
  transition,
  onChangeEvent,
  onChangeParams,
  onDelete,
  onClose,
}: {
  project: Project;
  transition: Transition;
  onChangeEvent: (event: string) => void;
  onChangeParams: (params: Record<string, JsonValue>) => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const { trigger } = transition;
  const action = findTransitionAction(project, trigger);
  const defs = targetParamDefs(project, {
    kind: transition.kind === "navigate" ? "screen" : "dialog",
    id: transition.target,
  });
  const params = action?.params ?? {};
  const names = [...new Set([...Object.keys(defs), ...Object.keys(params)])];
  const nodeType = triggerNodeType(project, trigger);
  const events = [...new Set([trigger.event, ...eventsForType(nodeType)])];
  if (nodeType === "Screen") events.splice(0, events.length, trigger.event);

  return (
    <aside className="edge-panel">
      <header>
        <strong>遷移</strong>
        <button type="button" className="edge-panel-close" onClick={onClose} aria-label="閉じる">
          ×
        </button>
      </header>
      <dl>
        <dt>起点</dt>
        <dd>
          {trigger.ownerId}
          {trigger.nodeId ? ` / ${trigger.nodeId}` : "（画面）"}
          {trigger.component && (
            <div className="edge-panel-note">
              コンポーネント {trigger.component.id} の {trigger.component.nodeId}{" "}
              に書かれた遷移です。変更はこのコンポーネントを使うすべての場所に反映されます
            </div>
          )}
        </dd>
        <dt>イベント</dt>
        <dd>
          <select value={trigger.event} onChange={(e) => onChangeEvent(e.target.value)}>
            {events.map((ev) => (
              <option key={ev} value={ev}>
                {ev}
              </option>
            ))}
          </select>
          <span className="edge-panel-index"> の {trigger.actionIndex + 1} 番目のアクション</span>
        </dd>
        <dt>アクション</dt>
        <dd>
          {transition.kind} → {transition.target}
        </dd>
        {names.length > 0 && <dt>params</dt>}
        {names.map((n) => (
          <dd key={n} className="edge-panel-param">
            <label>
              <span>
                {n}
                {defs[n] ? `: ${defs[n].type}` : "（未定義）"}
                {defs[n] && defs[n].default === undefined ? " *" : ""}
              </span>
              <ParamInput
                key={`${transition.id}:${n}:${JSON.stringify(params[n])}`}
                value={params[n]}
                onCommit={(v) => {
                  const next = { ...params };
                  if (v === undefined) delete next[n];
                  else next[n] = v;
                  onChangeParams(next);
                }}
              />
            </label>
          </dd>
        ))}
      </dl>
      <button type="button" className="edge-panel-delete" onClick={onDelete}>
        この遷移を削除
      </button>
    </aside>
  );
}

/** 文字列として編集する（`{{ 式 }}` も書ける）。空欄にすると params から消す。 */
function ParamInput({
  value,
  onCommit,
}: {
  value: JsonValue | undefined;
  onCommit: (v: JsonValue | undefined) => void;
}) {
  const initial =
    value === undefined ? "" : typeof value === "string" ? value : JSON.stringify(value);
  const [text, setText] = useState(initial);
  const commit = () => {
    if (text === initial) return;
    onCommit(text === "" ? undefined : text);
  };
  return (
    <input
      value={text}
      placeholder="{{ 式 }} または値"
      className={value === "" ? "edge-panel-empty" : undefined}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === "Enter" && commit()}
    />
  );
}
