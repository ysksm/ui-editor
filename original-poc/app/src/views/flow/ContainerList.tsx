import type { Project } from "@ui-editor/poc-model";
import { useEditor } from "../../state/store";

/** 画面・ダイアログの一覧（FR-FLOW-01）。選ぶと右のパネルで編集する。 */
export function ContainerList({
  project,
  selected,
}: {
  project: Project;
  selected: string | undefined;
}) {
  const select = useEditor((s) => s.select);
  const entry = project.entry ?? project.screens[0]?.id;
  const item = (id: string, name: string, kind: "screen" | "dialog") => (
    <li key={id}>
      <button
        aria-pressed={selected === id}
        className={`container-item container-${kind}`}
        onClick={() => select({ kind: "container", id })}
      >
        <span className="container-name">
          {id === entry && (
            <span className="entry-mark" title="最初の画面">
              ▶
            </span>
          )}
          {name}
        </span>
        <code className="muted">{id}</code>
      </button>
    </li>
  );
  return (
    <nav className="container-list" aria-label="画面とダイアログ">
      <h4>画面（{project.screens.length}）</h4>
      {project.screens.length === 0 ? (
        <p className="muted small">まだありません</p>
      ) : (
        <ul>{project.screens.map((s) => item(s.id, s.name, "screen"))}</ul>
      )}
      <h4>ダイアログ（{project.dialogs.length}）</h4>
      {project.dialogs.length === 0 ? (
        <p className="muted small">まだありません</p>
      ) : (
        <ul>{project.dialogs.map((d) => item(d.id, d.name, "dialog"))}</ul>
      )}
    </nav>
  );
}
