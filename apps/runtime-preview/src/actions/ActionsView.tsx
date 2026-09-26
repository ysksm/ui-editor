import { initRuntime, runActions, type ActionLog } from "@ui-editor/runtime";
import type { Action, ActionType, JsonValue, Node, Project } from "@ui-editor/schema";
import { useState, type ReactNode } from "react";
import { sampleLocals } from "../binding/sample-scope";
import * as edit from "./edit";

interface Props {
  project: Project;
  onChange: (project: Project) => void;
}

/** 画面・ダイアログ・コンポーネントのノードのイベントに、アクションを割り当てる（簡易）。 */
export function ActionsView({ project, onChange }: Props) {
  const [target, setTarget] = useState<edit.EventTarget>({
    owner: { kind: "screen", id: project.screens[0]!.id },
  });
  const owner = edit.ownerOf(project, target.owner.kind, target.owner.id);
  const node = owner && target.node ? edit.findNode(owner.root, target.node) : undefined;
  const events = edit.eventsOf(project, target);
  const setEvents = (next: typeof events) => onChange(edit.setEvents(project, target, next));
  const unused = edit.eventNamesFor(node).filter((name) => !(name in events));

  const owners: { kind: edit.OwnerKind; id: string; name: string; root: Node; label: string }[] = [
    ...project.screens.map((s) => ({
      kind: "screen" as const,
      id: s.id,
      name: s.name,
      root: s.root,
      label: "画面",
    })),
    ...(project.dialogs ?? []).map((d) => ({
      kind: "dialog" as const,
      id: d.id,
      name: d.name,
      root: d.root,
      label: "ダイアログ",
    })),
    ...(project.components ?? []).map((c) => ({
      kind: "component" as const,
      id: c.id,
      name: c.name ?? c.id,
      root: c.root,
      label: "部品",
    })),
  ];

  return (
    <div className="split">
      <aside className="sidebar">
        {owners.map((o) => {
          const isOwner = target.owner.kind === o.kind && target.owner.id === o.id;
          return (
            <div key={`${o.kind}:${o.id}`} className="tree-group">
              <button
                className={isOwner && !target.node ? "list-item active" : "list-item"}
                onClick={() => setTarget({ owner: { kind: o.kind, id: o.id } })}
              >
                <span>
                  <span className="muted small">{o.label}</span> {o.name}
                </span>
                {o.kind === "screen" &&
                  count(project.screens.find((s) => s.id === o.id)?.events) > 0 && (
                    <span className="count">
                      {count(project.screens.find((s) => s.id === o.id)?.events)}
                    </span>
                  )}
              </button>
              {isOwner && (
                <NodeTree
                  node={o.root}
                  depth={1}
                  selected={target.node}
                  onSelect={(id) => setTarget({ owner: { kind: o.kind, id: o.id }, node: id })}
                />
              )}
            </div>
          );
        })}
      </aside>
      <section className="main">
        <h2>
          {target.node ? (
            <>
              {target.node} <span className="muted small">{node?.type}</span>
            </>
          ) : (
            <>
              {owner && "name" in owner ? owner.name : target.owner.id}{" "}
              <span className="muted small">
                {target.owner.kind === "screen" ? "画面のイベント" : "ノードを選んでください"}
              </span>
            </>
          )}
        </h2>
        {(target.node || target.owner.kind === "screen") && (
          <>
            {Object.entries(events).map(([name, actions]) => (
              <EventEditor
                key={name}
                name={name}
                actions={actions}
                project={project}
                target={target}
                onChange={(next) => setEvents({ ...events, [name]: next })}
              />
            ))}
            {Object.keys(events).length === 0 && <p className="muted">イベントはありません</p>}
            <div className="form-row">
              {unused.map((name) => (
                <button
                  key={name}
                  className="button"
                  onClick={() =>
                    setEvents({ ...events, [name]: [edit.newAction("navigate", project)] })
                  }
                >
                  ＋ {name} イベント
                </button>
              ))}
            </div>
          </>
        )}
      </section>
    </div>
  );
}

function count(events: Record<string, unknown[]> | undefined): number {
  return Object.values(events ?? {}).reduce((n, a) => n + a.length, 0);
}

function NodeTree(props: {
  node: Node;
  depth: number;
  selected: string | undefined;
  onSelect: (id: string) => void;
}) {
  const { node } = props;
  const n = count(node.events);
  return (
    <>
      <button
        className={props.selected === node.id ? "list-item active" : "list-item"}
        style={{ paddingLeft: 8 + props.depth * 12 }}
        onClick={() => props.onSelect(node.id)}
      >
        <span>
          {node.id}{" "}
          <span className="muted small">
            {node.type}
            {node.repeat ? " ↻" : ""}
          </span>
        </span>
        {n > 0 && <span className="count">{n}</span>}
      </button>
      {node.children?.map((c) => (
        <NodeTree key={c.id} {...props} node={c} depth={props.depth + 1} />
      ))}
    </>
  );
}

function EventEditor(props: {
  name: string;
  actions: Action[];
  project: Project;
  target: edit.EventTarget;
  onChange: (actions: Action[]) => void;
}) {
  const { actions, project, onChange } = props;
  const [log, setLog] = useState<ActionLog[]>();

  // 題材の初期状態から、その場所を表示した状態（画面へ遷移 / ダイアログを開く）にしてから、
  // サンプルのスコープ（params・ループ変数・event）で試しに実行する
  const tryRun = () => {
    const { kind, id } = props.target.owner;
    const names = ["data", "state", kind === "component" ? "props" : "params", "event"];
    const locals = sampleLocals(project, {
      location: `${kind}:${id} / ${props.target.node ?? ""} / events.${props.name}`,
      expression: "",
      names,
      owner: props.target.owner,
      node: props.target.node,
    });
    const { params, props: p, event, ...rest } = locals;
    let start = initRuntime(project).state;
    const params_ = (params ?? {}) as Record<string, JsonValue>;
    if (kind === "screen" && props.name !== "mount")
      start = runActions(project, start, [{ type: "navigate", to: id, params: params_ }]).state;
    if (kind === "dialog")
      start = runActions(project, start, [
        { type: "openDialog", dialog: id, params: params_ },
      ]).state;
    const result = runActions(project, start, actions, { params, props: p, event, locals: rest });
    setLog([
      {
        action: { type: "mount", screen: start.screen.id },
        ok: true,
        message: `開始: 画面 ${start.screen.id}${start.dialogs.map((d) => ` + ${d.id}`).join("")} / ${JSON.stringify(locals)}`,
      },
      ...result.log,
    ]);
  };

  return (
    <div className="event">
      <div className="event-header">
        <strong>{props.name}</strong>
        <span className="muted small">{actions.length} 件のアクションを順に実行</span>
        <span className="grow" />
        <button className="button" onClick={tryRun}>
          ▶ 試しに実行
        </button>
      </div>
      <ol className="actions">
        {actions.map((action, i) => (
          <li key={i} className="action">
            <ActionForm
              action={action}
              project={project}
              onChange={(a) => onChange(actions.map((x, j) => (j === i ? a : x)))}
            />
            <div className="nowrap">
              <button
                className="icon"
                title="上へ"
                onClick={() => onChange(edit.move(actions, i, -1))}
              >
                ↑
              </button>
              <button
                className="icon"
                title="下へ"
                onClick={() => onChange(edit.move(actions, i, 1))}
              >
                ↓
              </button>
              <button
                className="icon"
                title="削除"
                onClick={() => onChange(actions.filter((_, j) => j !== i))}
              >
                ×
              </button>
            </div>
          </li>
        ))}
      </ol>
      <button
        className="button"
        onClick={() => onChange([...actions, edit.newAction("closeDialog", project)])}
      >
        ＋ アクションを追加
      </button>
      {log && (
        <ul className="log">
          {log.map((l, i) => (
            <li key={i} className={l.ok ? "ok" : "error-text"}>
              {i === 0 ? "" : l.ok ? "✓ " : "✗ "}
              {i > 0 && <code>{l.action.type}</code>} {l.message}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ActionForm(props: { action: Action; project: Project; onChange: (a: Action) => void }) {
  const { action, project, onChange } = props;
  return (
    <div className="action-form">
      <select
        value={action.type}
        onChange={(e) => onChange(edit.newAction(e.target.value as ActionType, project))}
      >
        {edit.ACTION_TYPES.map((t) => (
          <option key={t} value={t}>
            {edit.ACTION_LABELS[t]}（{t}）
          </option>
        ))}
      </select>
      {action.type === "navigate" && (
        <>
          <Field label="遷移先">
            <select
              value={action.to}
              onChange={(e) =>
                onChange(
                  edit.withParams(
                    { ...action, to: e.target.value },
                    project.screens.find((s) => s.id === e.target.value)?.params,
                  ),
                )
              }
            >
              {project.screens.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}（{s.id}）
                </option>
              ))}
            </select>
          </Field>
          <KeyValues
            label="params"
            value={action.params ?? {}}
            suggestions={Object.keys(project.screens.find((s) => s.id === action.to)?.params ?? {})}
            onChange={(params) =>
              onChange({ ...action, params: Object.keys(params).length ? params : undefined })
            }
          />
        </>
      )}
      {action.type === "openDialog" && (
        <>
          <Field label="ダイアログ">
            <select
              value={action.dialog}
              onChange={(e) =>
                onChange(
                  edit.withParams(
                    { ...action, dialog: e.target.value },
                    project.dialogs?.find((d) => d.id === e.target.value)?.params,
                  ),
                )
              }
            >
              {project.dialogs?.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}（{d.id}）
                </option>
              ))}
            </select>
          </Field>
          <KeyValues
            label="params"
            value={action.params ?? {}}
            suggestions={Object.keys(
              project.dialogs?.find((d) => d.id === action.dialog)?.params ?? {},
            )}
            onChange={(params) =>
              onChange({ ...action, params: Object.keys(params).length ? params : undefined })
            }
          />
        </>
      )}
      {action.type === "setState" && (
        <>
          <Field label="path（state.）">
            <input
              className="mono"
              value={action.path}
              onChange={(e) => onChange({ ...action, path: e.target.value })}
            />
          </Field>
          <Field label="値">
            <input
              className="mono"
              value={edit.formatLiteral(action.value)}
              onChange={(e) => onChange({ ...action, value: edit.parseLiteral(e.target.value) })}
            />
          </Field>
        </>
      )}
      {action.type === "updateData" && (
        <>
          <Field label="コレクション">
            <select
              value={action.collection}
              onChange={(e) => onChange({ ...action, collection: e.target.value })}
            >
              {Object.keys(project.sampleData).map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </Field>
          <KeyValues
            label="match（一致する条件）"
            value={action.match}
            onChange={(match) => onChange({ ...action, match })}
          />
          <KeyValues
            label="set（上書きする値）"
            value={action.set}
            onChange={(set) => onChange({ ...action, set })}
          />
        </>
      )}
    </div>
  );
}

function Field(props: { label: string; children: ReactNode }) {
  return (
    <label className="field">
      <span className="muted small">{props.label}</span>
      {props.children}
    </label>
  );
}

/** params / match / set のキーと値。値は `{{ }}` か JSON のリテラル。 */
function KeyValues(props: {
  label: string;
  value: Record<string, JsonValue>;
  suggestions?: string[];
  onChange: (value: Record<string, JsonValue>) => void;
}) {
  const entries = Object.entries(props.value);
  const set = (next: [string, JsonValue][]) => props.onChange(Object.fromEntries(next));
  const missing = (props.suggestions ?? []).filter((k) => !(k in props.value));
  return (
    <div className="field">
      <span className="muted small">{props.label}</span>
      {entries.map(([k, v], i) => (
        <div key={i} className="kv">
          <input
            className="mono key"
            value={k}
            onChange={(e) => set(entries.map((x, j) => (j === i ? [e.target.value, x[1]] : x)))}
          />
          <input
            className="mono"
            value={edit.formatLiteral(v)}
            onChange={(e) =>
              set(entries.map((x, j) => (j === i ? [x[0], edit.parseLiteral(e.target.value)] : x)))
            }
          />
          <button
            className="icon"
            title="削除"
            onClick={() => set(entries.filter((_, j) => j !== i))}
          >
            ×
          </button>
        </div>
      ))}
      <div>
        {missing.map((k) => (
          <button key={k} className="link small" onClick={() => set([...entries, [k, ""]])}>
            ＋{k}{" "}
          </button>
        ))}
        <button
          className="link small"
          onClick={() => set([...entries, [`key${entries.length + 1}`, ""]])}
        >
          ＋追加
        </button>
      </div>
    </div>
  );
}
