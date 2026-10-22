import {
  containerIdProblem,
  containers,
  countTransitionsTo,
  deleteContainer,
  extractTransitions,
  renameContainerId,
  setEntry,
  updateContainer,
  type ContainerRef,
  type Project,
} from "@ui-editor/poc-model";
import { CommitInput } from "../../components/form/CommitInput";
import { useEditor } from "../../state/store";
import { triggerLabel } from "./graph";

/** 選んだ画面・ダイアログの編集パネル（名前・id・path・最初の画面・削除）。 */
export function ContainerPanel({ project, info: r }: { project: Project; info: ContainerRef }) {
  const edit = useEditor((s) => s.edit);
  const select = useEditor((s) => s.select);
  const requestConfirm = useEditor((s) => s.requestConfirm);
  const c = r.container;
  const isScreen = r.kind === "screen";
  const entry = project.entry ?? project.screens[0]?.id;
  const kindLabel = isScreen ? "画面" : "ダイアログ";

  const remove = () => {
    const n = countTransitionsTo(project, c.id);
    requestConfirm(
      `${kindLabel}「${c.name}」を削除しますか？${n > 0 ? `ここへの遷移 ${n} 本も消えます。` : ""}`,
      "削除する",
      () => {
        if (edit(`${kindLabel}を削除`, (d) => deleteContainer(d, c.id))) select(null);
      },
    );
  };

  return (
    <aside className="inspector" aria-label={`${kindLabel}の編集`}>
      <h3>
        <span className={`kind-badge kind-${r.kind}`}>{kindLabel}</span> {c.name}
      </h3>
      <label className="row">
        <span>名前</span>
        <CommitInput
          aria-label={`${kindLabel}の名前`}
          value={c.name}
          validate={(v) => (v.trim() ? undefined : "名前を入れてください")}
          onCommit={(v) =>
            edit(`${kindLabel}の名前を変更`, (d) => updateContainer(d, c.id, { name: v.trim() }))
          }
        />
      </label>
      <label className="row">
        <span>id</span>
        <CommitInput
          aria-label={`${kindLabel}の id`}
          value={c.id}
          validate={(v) => containerIdProblem(project, v, c.id)}
          onCommit={(v) => {
            if (edit(`${kindLabel}の id を変更`, (d) => renameContainerId(d, c.id, v)))
              select({ kind: "container", id: v });
          }}
        />
      </label>
      {isScreen && (
        <label className="row">
          <span>path</span>
          <CommitInput
            aria-label="画面の path"
            placeholder={`/${c.id}`}
            value={"path" in c ? (c.path ?? "") : ""}
            validate={(v) => (v === "" || v.startsWith("/") ? undefined : "/ で始めてください")}
            onCommit={(v) =>
              edit("path を変更", (d) => updateContainer(d, c.id, { path: v || undefined }))
            }
          />
        </label>
      )}
      {isScreen && (
        <p className="row-note">
          {entry === c.id ? (
            <span className="entry-note">▶ 最初の画面</span>
          ) : (
            <button onClick={() => edit("最初の画面を変更", (d) => setEntry(d, c.id))}>
              最初の画面にする
            </button>
          )}
        </p>
      )}
      <TransitionLists project={project} id={c.id} isScreen={isScreen} />
      <hr />
      <button className="danger" onClick={remove}>
        {kindLabel}を削除
      </button>
    </aside>
  );
}

/** 出ていく遷移と、入ってくる遷移（ダイアログなら呼び出し元）の一覧（FR-FLOW-05）。 */
function TransitionLists({
  project,
  id,
  isScreen,
}: {
  project: Project;
  id: string;
  isScreen: boolean;
}) {
  const select = useEditor((s) => s.select);
  const transitions = extractTransitions(project);
  const name = (x: string) =>
    containers(project).find((r) => r.container.id === x)?.container.name ?? x;
  const out = transitions.filter((t) => t.from === id);
  const into = transitions.filter((t) => t.to === id);
  const item = (key: string, text: string, sub: string, placeholder: boolean) => (
    <li key={key}>
      <button className="transition-item" onClick={() => select({ kind: "transition", key })}>
        <span>{text}</span>
        <span className="muted small">
          {sub}
          {placeholder && <span className="placeholder-count">仮</span>}
        </span>
      </button>
    </li>
  );
  return (
    <>
      <h4>出ていく遷移（{out.length}）</h4>
      {out.length === 0 ? (
        <p className="muted small">
          ありません（フロー図でこのノードの右の点からドラッグして作る）
        </p>
      ) : (
        <ul className="transition-list" aria-label="出ていく遷移">
          {out.map((t) => item(t.key, `→ ${name(t.to)}`, triggerLabel(t), t.placeholder))}
        </ul>
      )}
      <h4>
        {isScreen ? "入ってくる遷移" : "呼び出し元"}（{into.length}）
      </h4>
      {into.length === 0 ? (
        <p className="muted small">
          {isScreen ? "どこからも遷移してきません" : "どこからも呼ばれていません"}
        </p>
      ) : (
        <ul className="transition-list" aria-label={isScreen ? "入ってくる遷移" : "呼び出し元"}>
          {into.map((t) => item(t.key, `${name(t.from)} →`, triggerLabel(t), t.placeholder))}
        </ul>
      )}
    </>
  );
}
