import { containers, deleteTransition, type Project, type Transition } from "@ui-editor/poc-model";
import { useEditor } from "../../state/store";
import { triggerLabel } from "./graph";

/** 選んだ遷移のパネル。トリガー・渡す値・付随アクションの編集はステップ 2（#76）で足す。 */
export function TransitionPanel({
  project,
  transition: t,
}: {
  project: Project;
  transition: Transition;
}) {
  const edit = useEditor((s) => s.edit);
  const select = useEditor((s) => s.select);
  const name = (id: string) =>
    containers(project).find((c) => c.container.id === id)?.container.name ?? id;
  return (
    <aside className="inspector" aria-label="遷移の編集">
      <h3>
        <span className={`kind-badge ${t.kind === "openDialog" ? "kind-dialog" : "kind-screen"}`}>
          {t.kind === "openDialog" ? "呼び出し" : "遷移"}
        </span>{" "}
        {name(t.from)} → {name(t.to)}
      </h3>
      <dl className="facts">
        <dt>トリガー</dt>
        <dd>
          {triggerLabel(t)}
          {t.placeholder && <span className="placeholder-count">仮の部品</span>}
        </dd>
        <dt>アクション</dt>
        <dd>
          <code>{t.kind === "navigate" ? `navigate → ${t.to}` : `openDialog → ${t.to}`}</code>
        </dd>
        {t.params && (
          <>
            <dt>渡す値</dt>
            <dd>
              <code>{JSON.stringify(t.params)}</code>
            </dd>
          </>
        )}
      </dl>
      <hr />
      <button
        className="danger"
        onClick={() => {
          if (edit("遷移を削除", (d) => deleteTransition(d, t.key))) select(null);
        }}
      >
        遷移を削除
      </button>
    </aside>
  );
}
