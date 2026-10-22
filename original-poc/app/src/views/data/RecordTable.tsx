import {
  compileEr,
  createRecord,
  deleteRecords,
  describeRecord,
  indexData,
  listRecords,
  updateRecords,
  type Location,
} from "@ui-editor/poc-datastore";
import {
  formatPath,
  type Entity,
  type Field,
  type Issue,
  type JsonValue,
  type Project,
} from "@ui-editor/poc-model";
import { useEffect, useMemo, useState } from "react";
import { CommitInput } from "../../components/form/CommitInput";
import { useEditor, useEditorStore } from "../../state/store";
import { applyDataResult, dataIssueMap, describeChanges } from "./data-edit";

const PAGE_SIZE = 100;

/** エンティティのレコードを表で編集する（FR-ER-05）。入れ子のエンティティは親の列を出す。 */
export function RecordTable({
  entity,
  highlight,
}: {
  entity: Entity;
  highlight?: string | undefined;
}) {
  const project = useEditor((s) => s.project);
  const issues = useEditor((s) => s.issues);
  const store = useEditorStore();
  const [page, setPage] = useState(0);
  const nest = compileEr(project).nest.get(entity.id);
  const parentEntity = nest ? project.entities.find((e) => e.id === nest.parent) : undefined;
  const locations = indexData(project, project.data).byEntity.get(entity.id) ?? [];
  const issueMap = useMemo(() => dataIssueMap(issues), [issues]);
  const fields = entity.fields.filter((f) => f.type !== "children");
  // 選んだレコード（入れ子の木・検証パネルから）があるページを開く
  useEffect(() => {
    const i = locations.findIndex((l) => String(l.record[entity.primaryKey]) === highlight);
    if (i >= 0) setPage(Math.floor(i / PAGE_SIZE));
  }, [highlight]);
  const pages = Math.max(1, Math.ceil(locations.length / PAGE_SIZE));
  const current = Math.min(page, pages - 1);
  const shown = locations.slice(current * PAGE_SIZE, (current + 1) * PAGE_SIZE);

  const remove = (loc: Location) => {
    const id = String(loc.record[entity.primaryKey]);
    const result = deleteRecords(project, project.data, entity.id, { [entity.primaryKey]: id });
    const text = result.ok ? describeChanges(project, result.changes) : "";
    if (applyDataResult(store, "レコードを削除", result) && result.ok) {
      store.getState().setNotice({ kind: "info", text: `${text}を削除しました` });
    }
  };

  return (
    <div className="record-table-wrap">
      <AddRow project={project} entity={entity} parentEntity={parentEntity} />
      {locations.length === 0 ? (
        <p className="muted">レコードがありません</p>
      ) : (
        <table className="record-table" aria-label={`${entity.name} のレコード`}>
          <thead>
            <tr>
              {parentEntity && <th>親（{parentEntity.name}）</th>}
              {fields.map((f) => (
                <th key={f.id} title={f.id}>
                  {f.name ?? f.id}
                  {f.required && <span className="required">*</span>}
                </th>
              ))}
              <th aria-label="操作" />
            </tr>
          </thead>
          <tbody>
            {shown.map((loc) => {
              const id = String(loc.record[entity.primaryKey] ?? "");
              return (
                <tr
                  key={formatPath(loc.path)}
                  className={highlight === id ? "highlight" : undefined}
                >
                  {parentEntity && (
                    <td className="muted">
                      {loc.parent ? describeRecord(parentEntity, loc.parent.record) : "?"}
                    </td>
                  )}
                  {fields.map((f) => (
                    <td key={f.id}>
                      <Cell
                        project={project}
                        entity={entity}
                        field={f}
                        loc={loc}
                        issues={issueMap.get(formatPath([...loc.path, f.id]))}
                      />
                    </td>
                  ))}
                  <td>
                    <button
                      className="link"
                      aria-label={`${id} を削除`}
                      onClick={() => remove(loc)}
                    >
                      削除
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      {pages > 1 && (
        <div className="pager">
          <button disabled={current === 0} onClick={() => setPage(current - 1)}>
            ← 前
          </button>
          <span>
            {current + 1} / {pages}（{locations.length} 件）
          </span>
          <button disabled={current >= pages - 1} onClick={() => setPage(current + 1)}>
            次 →
          </button>
        </div>
      )}
    </div>
  );
}

/** 行の追加。入れ子のエンティティは親を選ぶ。必須の項目は空のまま足し、表で埋める。 */
function AddRow({
  project,
  entity,
  parentEntity,
}: {
  project: Project;
  entity: Entity;
  parentEntity: Entity | undefined;
}) {
  const store = useEditorStore();
  const parents = parentEntity ? listRecords(project, project.data, parentEntity.id) : [];
  const [parent, setParent] = useState("");
  const parentId =
    parents.some((p) => p[parentEntity!.primaryKey] === parent) || !parentEntity
      ? parent
      : String(parents[0]?.[parentEntity.primaryKey] ?? "");
  const add = () => {
    const result = createRecord(
      project,
      project.data,
      entity.id,
      {},
      { parent: parentEntity ? parentId : undefined, validate: false },
    );
    if (applyDataResult(store, "レコードを追加", result) && result.ok) {
      store.getState().select({
        kind: "data",
        entity: entity.id,
        id: String(result.record[entity.primaryKey]),
      });
    }
  };
  return (
    <div className="add-row">
      {parentEntity && (
        <select
          aria-label={`追加先の${parentEntity.name}`}
          value={parentId}
          onChange={(e) => setParent(e.target.value)}
        >
          {parents.map((p) => {
            const id = String(p[parentEntity.primaryKey]);
            return (
              <option key={id} value={id}>
                {describeRecord(parentEntity, p)}（{id}）
              </option>
            );
          })}
        </select>
      )}
      <button onClick={add} disabled={Boolean(parentEntity) && parents.length === 0}>
        ＋ {entity.name}を追加
      </button>
      {parentEntity && parents.length === 0 && (
        <span className="muted">先に{parentEntity.name}を作ってください</span>
      )}
    </div>
  );
}

/** セルの入力。型に合わせた部品で、確定したら変える項目だけ検証して書き込む。 */
function Cell({
  project,
  entity,
  field: f,
  loc,
  issues,
}: {
  project: Project;
  entity: Entity;
  field: Field;
  loc: Location;
  issues: Issue[] | undefined;
}) {
  const store = useEditorStore();
  const id = String(loc.record[entity.primaryKey] ?? "");
  const value = loc.record[f.id];
  const label = `${id} の ${f.name ?? f.id}`;
  const problem = issues?.map((i) => i.message).join("\n");
  const className = problem
    ? issues!.some((i) => i.severity === "error")
      ? "cell-error"
      : "cell-warning"
    : undefined;
  const tryUpdate = (next: JsonValue) =>
    updateRecords(
      project,
      project.data,
      entity.id,
      { [entity.primaryKey]: id },
      { [f.id]: next },
      { validate: "changed" },
    );
  const commit = (next: JsonValue) => applyDataResult(store, "データを変更", tryUpdate(next));
  const validate = (next: JsonValue) => {
    const r = tryUpdate(next);
    return r.ok ? undefined : (r.fieldErrors?.[f.id] ?? r.error);
  };

  if (f.id === entity.primaryKey) {
    return (
      <code className={className} title={problem}>
        {id}
      </code>
    );
  }
  if (f.type === "boolean") {
    return (
      <input
        type="checkbox"
        aria-label={label}
        className={className}
        title={problem}
        checked={value === true}
        onChange={(e) => commit(e.target.checked)}
      />
    );
  }
  if (f.type === "enum" || f.type === "ref") {
    const options =
      f.type === "enum"
        ? (f.values ?? []).map((v) => ({ value: v, label: v }))
        : refOptions(project, f.entity);
    const current = value === null || value === undefined ? "" : String(value);
    return (
      <select
        aria-label={label}
        className={className}
        title={problem}
        value={current}
        onChange={(e) => commit(e.target.value === "" ? null : e.target.value)}
      >
        <option value="">（なし）</option>
        {!options.some((o) => o.value === current) && current !== "" && (
          <option value={current}>{current}（見つからない）</option>
        )}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    );
  }
  const toValue = (text: string): JsonValue =>
    f.type === "number" ? (text.trim() === "" ? null : Number(text)) : text;
  return (
    <CommitInput
      aria-label={label}
      className={className}
      title={problem}
      value={value === null || value === undefined ? "" : String(value)}
      inputMode={f.type === "number" ? "decimal" : undefined}
      validate={(text) =>
        f.type === "number" && text.trim() !== "" && !Number.isFinite(Number(text))
          ? "数値を入れてください"
          : validate(toValue(text))
      }
      onCommit={(text) => commit(toValue(text))}
    />
  );
}

function refOptions(
  project: Project,
  entityId: string | undefined,
): { value: string; label: string }[] {
  const target = project.entities.find((e) => e.id === entityId);
  if (!target) return [];
  return listRecords(project, project.data, target.id).map((r) => {
    const id = String(r[target.primaryKey]);
    return { value: id, label: `${describeRecord(target, r)}（${id}）` };
  });
}
