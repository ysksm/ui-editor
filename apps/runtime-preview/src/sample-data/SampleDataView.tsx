import {
  checkSampleData,
  defaultValue,
  formatType,
  parseDataModel,
  type FieldDef,
  type TypeDecl,
} from "@ui-editor/runtime";
import type { JsonValue } from "@ui-editor/schema";
import { useMemo, useState } from "react";
import * as edit from "./edit";

interface Props {
  dataModelSource: string;
  sampleData: edit.SampleData;
  onChange: (sampleData: edit.SampleData) => void;
}

/** データモデルごとのサンプルデータを表で閲覧・編集する。型に合わない値は警告する。 */
export function SampleDataView({ dataModelSource, sampleData, onChange }: Props) {
  const decls = useMemo(() => parseDataModel(dataModelSource).declarations, [dataModelSource]);
  const checks = useMemo(() => checkSampleData(sampleData, decls), [sampleData, decls]);
  const [selected, setSelected] = useState(checks[0]?.collection);
  const current = checks.find((c) => c.collection === selected) ?? checks[0];

  return (
    <div className="split">
      <aside className="sidebar">
        <h3>コレクション（{checks.length}）</h3>
        <ul className="list">
          {checks.map((c) => (
            <li key={c.collection}>
              <button
                className={c === current ? "list-item active" : "list-item"}
                onClick={() => setSelected(c.collection)}
              >
                <span>
                  {c.collection}
                  {c.issues.length > 0 && <span className="warn-badge">{c.issues.length}</span>}
                </span>
                <span className="muted">{sampleData[c.collection]?.length ?? 0} 件</span>
              </button>
            </li>
          ))}
        </ul>
      </aside>
      <section className="main">
        {current && (
          <CollectionTable
            key={current.collection}
            collection={current.collection}
            model={decls.find((d) => d.name === current.model)}
            decls={decls}
            records={sampleData[current.collection] ?? []}
            issues={current.issues}
            sampleData={sampleData}
            onChange={onChange}
          />
        )}
      </section>
    </div>
  );
}

function CollectionTable(props: {
  collection: string;
  model: TypeDecl | undefined;
  decls: TypeDecl[];
  records: JsonValue[];
  issues: { path: (string | number)[]; message: string }[];
  sampleData: edit.SampleData;
  onChange: (sampleData: edit.SampleData) => void;
}) {
  const { collection, model, decls, records, sampleData, onChange } = props;
  const fields: FieldDef[] = model?.type.kind === "object" ? model.type.fields : [];
  const columns = edit.columnsOf(
    records,
    fields.map((f) => f.name),
  );

  // セル（レコード位置 + フィールド）ごとの警告
  const cellIssues = new Map<string, string[]>();
  for (const issue of props.issues) {
    const [index, field, ...rest] = issue.path;
    const key = `${index}:${field ?? ""}`;
    const text = rest.length > 0 ? `${rest.join(".")}: ${issue.message}` : issue.message;
    cellIssues.set(key, [...(cellIssues.get(key) ?? []), text]);
  }

  return (
    <div>
      <div className="toolbar">
        <h2>
          {collection}{" "}
          <span className="muted small">
            {model
              ? `: ${model.name}[]`
              : "（対応するデータモデルがありません。型の検査はしません）"}
          </span>
        </h2>
        <button
          className="button"
          onClick={() =>
            onChange(
              edit.addRecord(
                sampleData,
                collection,
                (model ? defaultValue(model.type, decls) : {}) as JsonValue,
              ),
            )
          }
        >
          ＋ レコードを追加
        </button>
      </div>
      <div className="table-scroll">
        <table className="table data-table">
          <thead>
            <tr>
              <th>#</th>
              {columns.map((c) => {
                const f = fields.find((x) => x.name === c);
                return (
                  <th key={c} title={f ? formatType(f.type) : "型に無いフィールド"}>
                    {c}
                    {f && !f.optional && <span className="required">*</span>}
                    <div className="muted mono small">{f ? formatType(f.type) : "—"}</div>
                  </th>
                );
              })}
              <th />
            </tr>
          </thead>
          <tbody>
            {records.map((record, i) => {
              const rowIssues = cellIssues.get(`${i}:`);
              return (
                <tr
                  key={i}
                  className={rowIssues ? "invalid-row" : undefined}
                  title={rowIssues?.join("\n")}
                >
                  <td className="muted">{i + 1}</td>
                  {columns.map((c) => {
                    const messages = cellIssues.get(`${i}:${c}`);
                    return (
                      <td
                        key={c}
                        className={messages ? "invalid-cell" : undefined}
                        title={messages?.join("\n")}
                      >
                        <Cell
                          value={edit.isRecord(record) ? record[c] : undefined}
                          editor={edit.editorFor(fields.find((f) => f.name === c)?.type, decls)}
                          onChange={(v) => onChange(edit.setField(sampleData, collection, i, c, v))}
                        />
                      </td>
                    );
                  })}
                  <td className="nowrap">
                    <button
                      className="icon"
                      title="複製"
                      onClick={() => onChange(edit.duplicateRecord(sampleData, collection, i))}
                    >
                      ⧉
                    </button>
                    <button
                      className="icon"
                      title="削除"
                      onClick={() => onChange(edit.removeRecord(sampleData, collection, i))}
                    >
                      ×
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {props.issues.length > 0 && (
        <ul className="diagnostics">
          {props.issues.map((issue, i) => (
            <li key={i}>
              <span className="mono">
                [{issue.path[0]}]{issue.path.slice(1).map((p) => `.${p}`)}
              </span>
              : {issue.message}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Cell(props: {
  value: JsonValue | undefined;
  editor: edit.CellEditor;
  onChange: (value: JsonValue | undefined) => void;
}) {
  const { value, editor, onChange } = props;
  // 型に合わない値が入っているときは JSON で編集させる（値を壊さないため）
  const matches =
    (editor.kind === "text" && typeof value === "string") ||
    (editor.kind === "number" && (typeof value === "number" || value === undefined)) ||
    (editor.kind === "checkbox" && typeof value === "boolean") ||
    (editor.kind === "select" && editor.options.includes(value as string));

  if (matches && editor.kind === "text")
    return <input value={value as string} onChange={(e) => onChange(e.target.value)} />;
  if (matches && editor.kind === "number")
    return (
      <input
        type="number"
        value={(value as number | undefined) ?? ""}
        onChange={(e) => onChange(e.target.value === "" ? undefined : Number(e.target.value))}
      />
    );
  if (matches && editor.kind === "checkbox")
    return (
      <input
        type="checkbox"
        checked={value as boolean}
        onChange={(e) => onChange(e.target.checked)}
      />
    );
  if (matches && editor.kind === "select")
    return (
      <select
        value={JSON.stringify(value)}
        onChange={(e) => onChange(JSON.parse(e.target.value) as JsonValue)}
      >
        {editor.options.map((o) => (
          <option key={String(o)} value={JSON.stringify(o)}>
            {String(o)}
          </option>
        ))}
      </select>
    );
  return <JsonCell key={JSON.stringify(value)} value={value} onChange={onChange} />;
}

/** オブジェクト・配列・型に合わない値は JSON のテキストで編集する（確定は blur 時）。 */
function JsonCell(props: {
  value: JsonValue | undefined;
  onChange: (value: JsonValue | undefined) => void;
}) {
  const initial = props.value === undefined ? "" : JSON.stringify(props.value);
  const [text, setText] = useState(initial);
  const [error, setError] = useState<string>();
  return (
    <input
      className={error ? "mono invalid" : "mono"}
      title={error}
      value={text}
      placeholder="（なし）"
      onChange={(e) => setText(e.target.value)}
      onBlur={() => {
        if (text === initial) return;
        const parsed = edit.parseJsonCell(text);
        if ("error" in parsed) setError(parsed.error);
        else {
          setError(undefined);
          props.onChange(parsed.value);
        }
      }}
    />
  );
}
