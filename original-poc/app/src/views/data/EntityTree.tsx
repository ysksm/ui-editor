import { listRecords } from "@ui-editor/poc-datastore";
import { nestParents, type Entity, type Project } from "@ui-editor/poc-model";

/** 左のエンティティ一覧。入れ子の子は親の下に字下げして並べ、件数を出す。 */
export function EntityTree({
  project,
  selected,
  onSelect,
}: {
  project: Project;
  selected: string | undefined;
  onSelect: (entity: string) => void;
}) {
  const parents = nestParents(project.entities);
  const children = (id: string | undefined) =>
    project.entities.filter((e) => (parents.get(e.id)?.parent ?? undefined) === id);
  const item = (e: Entity, depth: number): React.JSX.Element => (
    <li key={e.id}>
      <button
        aria-pressed={selected === e.id}
        style={{ paddingLeft: 8 + depth * 14 }}
        onClick={() => onSelect(e.id)}
      >
        {depth > 0 && <span className="muted">└ </span>}
        {e.name}
        <span className="count">{listRecords(project, project.data, e.id).length}</span>
      </button>
      {children(e.id).length > 0 && <ul>{children(e.id).map((c) => item(c, depth + 1))}</ul>}
    </li>
  );
  // 循環している（どの木にも属さない）エンティティも出す
  const shown = new Set<string>();
  const walk = (id: string | undefined) =>
    children(id).forEach((c) => (shown.add(c.id), walk(c.id)));
  walk(undefined);
  const orphans = project.entities.filter((e) => !shown.has(e.id));
  return (
    <nav className="entity-tree" aria-label="エンティティ">
      <ul>
        {children(undefined).map((e) => item(e, 0))}
        {orphans.map((e) => item(e, 0))}
      </ul>
    </nav>
  );
}
