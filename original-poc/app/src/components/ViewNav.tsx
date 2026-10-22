import { useEditor, VIEWS } from "../state/store";

export function ViewNav() {
  const view = useEditor((s) => s.view);
  const setView = useEditor((s) => s.setView);
  return (
    <nav className="view-nav" aria-label="ビュー">
      {VIEWS.map((v) => (
        <button key={v.id} aria-pressed={view === v.id} onClick={() => setView(v.id)}>
          {v.label}
        </button>
      ))}
    </nav>
  );
}
