import type { TypeDecl, TypeRef } from "@ui-editor/runtime";
import type { JsonValue, Project } from "@ui-editor/schema";

/** サンプルデータ（コレクション名 → レコードの配列）の編集操作。どれも新しいオブジェクトを返す。 */

export type SampleData = Project["sampleData"];
type Rec = Record<string, JsonValue>;

function mapRecords(
  data: SampleData,
  collection: string,
  fn: (records: JsonValue[]) => JsonValue[],
) {
  return { ...data, [collection]: fn(data[collection] ?? []) };
}

export function setField(
  data: SampleData,
  collection: string,
  index: number,
  field: string,
  value: JsonValue | undefined,
): SampleData {
  return mapRecords(data, collection, (records) =>
    records.map((r, i) => {
      if (i !== index) return r;
      const next: Rec = { ...(isRecord(r) ? r : {}) };
      if (value === undefined) delete next[field];
      else next[field] = value;
      return next;
    }),
  );
}

export function addRecord(data: SampleData, collection: string, record: JsonValue): SampleData {
  return mapRecords(data, collection, (records) => [...records, record]);
}

export function duplicateRecord(data: SampleData, collection: string, index: number): SampleData {
  return mapRecords(data, collection, (records) => [
    ...records.slice(0, index + 1),
    structuredClone(records[index]!),
    ...records.slice(index + 1),
  ]);
}

export function removeRecord(data: SampleData, collection: string, index: number): SampleData {
  return mapRecords(data, collection, (records) => records.filter((_, i) => i !== index));
}

export function isRecord(value: unknown): value is Rec {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** 表の列: 型のフィールド順、その後に型に無いキー（レコードに現れた順）。 */
export function columnsOf(records: JsonValue[], fields: string[]): string[] {
  const cols = [...fields];
  for (const r of records) {
    if (!isRecord(r)) continue;
    for (const key of Object.keys(r)) if (!cols.includes(key)) cols.push(key);
  }
  return cols;
}

/** セルの入力に使う部品。型名の参照は展開して決める。 */
export type CellEditor =
  | { kind: "text" }
  | { kind: "number" }
  | { kind: "checkbox" }
  | { kind: "select"; options: (string | number | boolean)[] }
  | { kind: "json" };

export function editorFor(type: TypeRef | undefined, decls: TypeDecl[]): CellEditor {
  const t = resolve(type, decls);
  if (!t) return { kind: "json" };
  if (t.kind === "primitive") {
    if (t.name === "string") return { kind: "text" };
    if (t.name === "number") return { kind: "number" };
    if (t.name === "boolean") return { kind: "checkbox" };
  }
  if (t.kind === "literal") return { kind: "select", options: [t.value] };
  if (t.kind === "union") {
    const members = t.types.map((m) => resolve(m, decls));
    if (members.every((m) => m?.kind === "literal"))
      return {
        kind: "select",
        options: members.map((m) => (m as { value: string | number | boolean }).value),
      };
  }
  return { kind: "json" };
}

function resolve(type: TypeRef | undefined, decls: TypeDecl[], depth = 0): TypeRef | undefined {
  if (type?.kind !== "ref" || depth > 10) return type;
  return resolve(decls.find((d) => d.name === type.name)?.type, decls, depth + 1);
}

/** JSON として入力されたセルの値を読む。空欄はフィールドを消す（undefined）。 */
export function parseJsonCell(text: string): { value: JsonValue | undefined } | { error: string } {
  if (text.trim() === "") return { value: undefined };
  try {
    return { value: JSON.parse(text) as JsonValue };
  } catch {
    return { error: "JSON として読めません" };
  }
}
