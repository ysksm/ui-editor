import { describeRecord } from "@ui-editor/poc-datastore";
import { isRecord, type DataRecord, type Entity, type Project } from "@ui-editor/poc-model";

/** 親から子をたどる入れ子の木（FR-ER-06）。レコードを選ぶと表でそのレコードを開く。 */
export function NestedTree({
  project,
  onOpen,
}: {
  project: Project;
  onOpen: (entity: string, id: string) => void;
}) {
  const byId = new Map(project.entities.map((e) => [e.id, e]));
  const record = (entity: Entity, r: DataRecord, key: string): React.JSX.Element => {
    const id = String(r[entity.primaryKey] ?? "");
    const values = entity.fields
      .filter(
        (f) => f.type !== "children" && f.id !== entity.primaryKey && f.id !== entity.displayField,
      )
      .map(
        (f) =>
          `${f.name ?? f.id}: ${r[f.id] === null || r[f.id] === undefined ? "—" : String(r[f.id])}`,
      )
      .join("・");
    const childFields = entity.fields.filter(
      (f) => f.type === "children" && f.entity && byId.has(f.entity),
    );
    const label = (
      <>
        <button className="link tree-open" onClick={() => onOpen(entity.id, id)}>
          {describeRecord(entity, r)}
        </button>
        <code className="muted">{id}</code>
        <span className="muted tree-values">{values}</span>
      </>
    );
    if (childFields.length === 0)
      return (
        <li key={key} className="tree-leaf">
          {label}
        </li>
      );
    return (
      <li key={key}>
        <details>
          <summary>{label}</summary>
          <ul>
            {childFields.map((f) => {
              const child = byId.get(f.entity!)!;
              const v = r[f.id];
              const list = Array.isArray(v) ? v.filter(isRecord) : isRecord(v) ? [v] : [];
              return (
                <li key={f.id} className="tree-field">
                  <span className="tree-field-name">
                    {f.name ?? f.id}（{list.length}）
                  </span>
                  {list.length > 0 && (
                    <ul>{list.map((c, i) => record(child, c, `${f.id}-${i}`))}</ul>
                  )}
                </li>
              );
            })}
          </ul>
        </details>
      </li>
    );
  };
  const roots = Object.entries(project.data).filter(([id]) => byId.has(id));
  if (roots.length === 0) return <p className="muted">データがありません</p>;
  return (
    <div className="nested-tree" aria-label="入れ子の木">
      {roots.map(([id, records]) => {
        const entity = byId.get(id)!;
        return (
          <section key={id}>
            <h4>
              {entity.name}（{records.length}）
            </h4>
            <ul>{records.map((r, i) => record(entity, r, `${id}-${i}`))}</ul>
          </section>
        );
      })}
    </div>
  );
}
