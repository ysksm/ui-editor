import { findContainer, type Project } from "@ui-editor/poc-model";
import {
  back,
  currentFrame,
  fireEvent,
  resetData,
  scopeFor,
  type Frame,
  type RuntimeState,
} from "@ui-editor/poc-runtime";
import { useState } from "react";
import { useEditor } from "../state/store";
import { NodeView, type Fire } from "./NodeView";

/**
 * プレビュー（FR-RUN-01・02・06）。最初の画面から始め、部品を押して遷移を辿る。
 * ダイアログは画面の上に重ね、閉じると呼び出し元に戻る。フロー図は同じランタイムの状態で現在地を強調する。
 */
export function PreviewPane() {
  const project = useEditor((s) => s.project);
  const runtime = useEditor((s) => s.runtime);
  const setRuntime = useEditor((s) => s.setRuntime);
  const edit = useEditor((s) => s.edit);
  const restart = useEditor((s) => s.restartPreview);
  const toggle = useEditor((s) => s.togglePreview);
  const [showLog, setShowLog] = useState(false);
  if (!runtime) return null;
  const screen = runtime.history.at(-1);
  const top = currentFrame(runtime);
  const canBack = runtime.dialogs.length > 0 || runtime.history.length > 1;

  return (
    <aside className="preview-pane" aria-label="プレビュー">
      <div className="preview-toolbar">
        <strong>プレビュー</strong>
        <button
          onClick={() => setRuntime(back(project, runtime))}
          disabled={!canBack}
          aria-label="戻る"
        >
          ← 戻る
        </button>
        <button onClick={restart}>最初から</button>
        <button onClick={() => setRuntime(resetData(project, runtime))}>データをリセット</button>
        <button
          disabled={runtime.data === project.data}
          title="プレビューで変えたデータを、プロジェクトのサンプルデータとして保存する（元に戻すで戻せる）"
          onClick={() =>
            edit("プレビューのデータをサンプルデータにする", (d) => void (d.data = runtime.data))
          }
        >
          このデータをサンプルデータにする
        </button>
        <button aria-pressed={showLog} onClick={() => setShowLog(!showLog)}>
          ログ（{runtime.log.length}）
        </button>
        <button
          className="link close"
          onClick={() => toggle(false)}
          aria-label="プレビューを閉じる"
        >
          ×
        </button>
      </div>
      <div className="preview-device">
        {screen ? (
          <FrameView
            project={project}
            runtime={runtime}
            frame={screen}
            active={top === screen}
            onRuntime={setRuntime}
          />
        ) : (
          <p className="muted">最初の画面がありません（フローで画面を作ってください）</p>
        )}
        {runtime.dialogs.map((d) => (
          <div className="preview-dialog-backdrop" key={d.id}>
            <div className="preview-dialog" role="dialog" aria-label={nameOf(project, d.container)}>
              <FrameView
                project={project}
                runtime={runtime}
                frame={d}
                active={top === d}
                onRuntime={setRuntime}
              />
            </div>
          </div>
        ))}
      </div>
      {showLog && <LogView runtime={runtime} />}
    </aside>
  );
}

/** 1 つの画面・ダイアログ（フレーム）を描く。部品を押すと fireEvent の結果を onRuntime に渡す。 */
export function FrameView({
  project,
  runtime,
  frame,
  active,
  onRuntime,
}: {
  project: Project;
  runtime: RuntimeState;
  frame: Frame;
  active: boolean;
  onRuntime: (runtime: RuntimeState) => void;
}) {
  const ref = findContainer(project, frame.container);
  if (!ref) {
    return (
      <p className="pv-error">
        「{frame.container}」は削除されました。「最初から」でやり直してください。
      </p>
    );
  }
  const fire: Fire = (node, event, payload, locals) => {
    // 古い（奥の）フレームは押せない
    if (!active) return;
    onRuntime(fireEvent(project, runtime, { frameId: frame.id, node, event, payload, locals }));
  };
  const scope = scopeFor(project, runtime, frame);
  return (
    <section
      className={`pv-frame pv-frame-${ref.kind}`}
      aria-label={`${ref.kind === "screen" ? "画面" : "ダイアログ"}: ${ref.container.name}`}
    >
      <header className="pv-frame-title">
        <span className={`kind-badge kind-${ref.kind}`}>
          {ref.kind === "screen" ? "画面" : "ダイアログ"}
        </span>
        {ref.container.name}
        {Object.keys(frame.params).length > 0 && (
          <code className="muted small">{JSON.stringify(frame.params)}</code>
        )}
      </header>
      <div className="pv-frame-body">
        {ref.container.root ? (
          <NodeView node={ref.container.root} ctx={{ project, runtime, scope, fire }} />
        ) : (
          <p className="muted">中身がありません（フロー図で遷移を引くと仮のボタンが置かれます）</p>
        )}
      </div>
    </section>
  );
}

function LogView({ runtime }: { runtime: RuntimeState }) {
  return (
    <ol className="preview-log" aria-label="ログ" reversed>
      {[...runtime.log].reverse().map((l) => (
        <li key={l.seq} className={`log-${l.level}`}>
          {l.container && <code className="muted">{l.container}</code>} {l.message}
        </li>
      ))}
    </ol>
  );
}

function nameOf(project: Project, id: string): string {
  return findContainer(project, id)?.container.name ?? id;
}
