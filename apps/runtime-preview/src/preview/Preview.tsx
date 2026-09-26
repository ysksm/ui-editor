import type { Project } from "@ui-editor/schema";
import { useEffect, useMemo, useReducer } from "react";
import { renderRoot, type RenderEnv } from "./Render";
import { initPreview, previewReducer, screenUrl } from "./store";

/** 題材アプリを実行時に解釈して動かすプレビュー。右側に実行ログと state を出す。 */
export function Preview({ project }: { project: Project }) {
  const reducer = useMemo(() => previewReducer(project), [project]);
  const [s, dispatch] = useReducer(reducer, project, initPreview);
  // プロジェクト（データモデル・サンプルデータ・イベント）を編集したら最初からやり直す
  useEffect(() => dispatch({ type: "reset" }), [project]);

  const env: RenderEnv = {
    project,
    rt: s.rt,
    fire: (label, actions, context) => dispatch({ type: "fire", label, actions, context }),
  };
  const screen = project.screens.find((x) => x.id === s.rt.screen.id);

  return (
    <div className="split">
      <section className="main pv-main">
        <div className="pv-bar">
          <select
            value={s.rt.screen.id}
            onChange={(e) =>
              env.fire(
                `画面を選択`,
                [
                  {
                    type: "navigate",
                    to: e.target.value,
                    params: sampleParamsFor(project, e.target.value),
                  },
                ],
                {},
              )
            }
          >
            {project.screens.map((x) => (
              <option key={x.id} value={x.id}>
                {x.name}
              </option>
            ))}
          </select>
          <code className="pv-url">{screen ? screenUrl(screen.path, s.rt.screen.params) : ""}</code>
          <button className="button" onClick={() => dispatch({ type: "reset" })}>
            リセット
          </button>
        </div>
        <div className="pv-frame">
          {screen ? (
            renderRoot(env, screen.root, s.rt.screen.params)
          ) : (
            <p>画面 {s.rt.screen.id} がありません</p>
          )}
          {s.rt.dialogs.map((d, i) => {
            const dialog = project.dialogs?.find((x) => x.id === d.id);
            return (
              <div key={i} className="pv-overlay" style={{ zIndex: 10 + i }}>
                <div
                  className="pv-dialog"
                  role="dialog"
                  aria-label={dialog?.name}
                  data-dialog={d.id}
                >
                  <div className="pv-dialog-title">{dialog?.name ?? d.id}</div>
                  {dialog ? renderRoot(env, dialog.root, d.params) : null}
                </div>
              </div>
            );
          })}
        </div>
      </section>
      <aside className="sidebar wide pv-side">
        <h3>表示中</h3>
        <pre className="code small">
          {JSON.stringify({ screen: s.rt.screen, dialogs: s.rt.dialogs }, null, 2)}
        </pre>
        <h3>state</h3>
        <pre className="code small">{JSON.stringify(s.rt.state, null, 2)}</pre>
        <h3>実行ログ（新しい順）</h3>
        <ul className="log pv-log">
          {s.history.length === 0 && (
            <li className="muted">（イベントを発火するとここに出ます）</li>
          )}
          {s.history.map((h, i) => (
            <li key={s.history.length - i}>
              <strong>{h.label}</strong>
              <ul>
                {h.log.map((l, j) => (
                  <li key={j} className={l.ok ? "ok" : "error-text"}>
                    {l.ok ? "✓" : "✗"} <code>{l.action.type}</code> {l.message}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      </aside>
    </div>
  );
}

/** 画面を直接選んだときの params（`deviceId` → 最初の機器の id など）。 */
function sampleParamsFor(project: Project, screenId: string): Record<string, string> {
  const screen = project.screens.find((x) => x.id === screenId);
  return Object.fromEntries(
    Object.keys(screen?.params ?? {}).map((k) => {
      const collection = Object.keys(project.sampleData).find((c) =>
        c.toLowerCase().startsWith(k.replace(/Id$/, "").toLowerCase()),
      );
      const first = collection
        ? (project.sampleData[collection]?.[0] as { id?: unknown } | undefined)
        : undefined;
      return [k, String(first?.id ?? "")];
    }),
  );
}
