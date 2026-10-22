import {
  nestParents,
  type Container,
  type Entity,
  type Field,
  type JsonValue,
  type ParamDef,
  type Project,
} from "@ui-editor/poc-model";
import { literal, propKey } from "../names.js";

/**
 * ER とデータから、生成アプリの `src/model/`（types.ts・schema.ts・data.ts）を作る。
 * 型の規則は architecture.md 4.12 の「ER から型への規則」。
 */

/** 生成アプリの `runtime/datastore.ts` の Schema と同じ形（ER のうち、データ操作に使うところ）。 */
export interface RuntimeSchema {
  entities: {
    id: string;
    name: string;
    primaryKey: string;
    displayField?: string;
    fields: RuntimeField[];
  }[];
  nest: Record<string, { parent: string; field: string; cardinality: "many" | "one" }>;
}

type RuntimeField = Pick<
  Field,
  | "id"
  | "name"
  | "type"
  | "required"
  | "default"
  | "values"
  | "entity"
  | "onDelete"
  | "cardinality"
  | "min"
  | "max"
>;

const FIELD_KEYS = [
  "id",
  "name",
  "type",
  "required",
  "default",
  "values",
  "entity",
  "onDelete",
  "cardinality",
  "min",
  "max",
] as const;

/** ER から生成アプリの Schema を作る（書式 format など、データ操作に使わないものは除く）。 */
export function toRuntimeSchema(project: Pick<Project, "entities">): RuntimeSchema {
  return {
    entities: project.entities.map((e) => ({
      id: e.id,
      name: e.name,
      primaryKey: e.primaryKey,
      ...(e.displayField ? { displayField: e.displayField } : {}),
      fields: e.fields.map((f) => {
        const out: Record<string, unknown> = {};
        for (const k of FIELD_KEYS) if (f[k] !== undefined) out[k] = f[k];
        return out as RuntimeField;
      }),
    })),
    nest: Object.fromEntries(nestParents(project.entities)),
  };
}

// ---- types.ts ----

function valueType(f: Field): string {
  switch (f.type) {
    case "number":
      return "number";
    case "boolean":
      return "boolean";
    case "enum":
      return (f.values ?? []).map((v) => JSON.stringify(v)).join(" | ") || "string";
    default:
      return "string";
  }
}

function fieldDoc(entity: Entity, f: Field, entities: Map<string, Entity>): string {
  const notes: string[] = [];
  if (f.id === entity.primaryKey) notes.push("主キー");
  else if (f.type !== "children" && f.required) notes.push("必須");
  if (f.type === "children") {
    notes.push(`入れ子の${entities.get(f.entity ?? "")?.name ?? f.entity}`);
    if ((f.cardinality ?? "many") === "one") notes.push("1 件");
  }
  if (f.type === "ref")
    notes.push(
      `${entities.get(f.entity ?? "")?.name ?? f.entity}の主キー。削除されたら ${f.onDelete ?? "restrict"}`,
    );
  if (f.type === "date") notes.push("ISO 8601");
  if (f.format) notes.push(`書式 ${f.format}`);
  if (f.min !== undefined || f.max !== undefined) notes.push(`${f.min ?? ""}〜${f.max ?? ""}`);
  if (f.default !== undefined) notes.push(`既定値 ${JSON.stringify(f.default)}`);
  const head = f.name ?? f.id;
  return notes.length > 0 ? `${head}（${notes.join("、")}）` : head;
}

function fieldLine(entity: Entity, f: Field, entities: Map<string, Entity>): string {
  const doc = `/** ${fieldDoc(entity, f, entities)} */`;
  if (f.type === "children") {
    const child = f.entity ?? "unknown";
    return (f.cardinality ?? "many") === "one"
      ? `${doc}\n${f.id}?: ${child} | null;`
      : `${doc}\n${f.id}?: ${child}[];`;
  }
  if (f.id === entity.primaryKey || f.required) return `${doc}\n${f.id}: ${valueType(f)};`;
  return `${doc}\n${f.id}?: ${valueType(f)} | null;`;
}

/** state の初期値から型を作る（null は unknown、要素の型がそろわない配列は unknown[]）。 */
function jsonType(value: JsonValue): string {
  if (value === null) return "unknown";
  if (Array.isArray(value)) {
    const types = [...new Set(value.map(jsonType))];
    return types.length === 1 ? `${types[0]}[]` : "unknown[]";
  }
  if (typeof value === "object") {
    const entries = Object.entries(value);
    if (entries.length === 0) return "Record<string, unknown>";
    return `{ ${entries.map(([k, v]) => `${propKey(k)}: ${jsonType(v)}`).join("; ")} }`;
  }
  return typeof value;
}

function paramsType(c: Container): string {
  const entries = Object.entries(c.params ?? {});
  if (entries.length === 0) return "Record<never, never>";
  const type = (def: ParamDef) =>
    def.type === "number" ? "number" : def.type === "boolean" ? "boolean" : "string";
  return `{ ${entries.map(([k, def]) => `${propKey(k)}${def.required ? "" : "?"}: ${type(def)}`).join("; ")} }`;
}

function record(lines: string[], empty = "Record<never, never>"): string {
  return lines.length > 0 ? `{\n${lines.join("\n")}\n}` : empty;
}

export function emitTypes(project: Project): string {
  const entities = new Map(project.entities.map((e) => [e.id, e]));
  const nest = nestParents(project.entities);
  const roots = project.entities.filter((e) => !nest.has(e.id));
  const doc = (e: Entity) => {
    const n = nest.get(e.id);
    return n ? `${e.name}（${entities.get(n.parent)?.name ?? n.parent}の入れ子）` : e.name;
  };
  const out: string[] = [];
  out.push(`import type { FieldValue } from "../runtime/datastore";

/**
 * 「${project.name}」の型（ER から生成）。
 * 必須でない項目はサンプルデータで省略されうるので \`?\`、値が無いときは null。
 */

export type { FieldValue };`);

  for (const e of project.entities) {
    out.push(
      `/** ${doc(e)} */\nexport type ${e.id} = ${record(e.fields.map((f) => fieldLine(e, f, entities)))};`,
    );
  }

  out.push(`/** エンティティ id → 型。 */
export type Entities = ${record(project.entities.map((e) => `${e.id}: ${e.id};`))};

export type EntityName = keyof Entities;`);

  out.push(`/** エンティティ id → 項目名（入れ子の項目を除く）。 */
export type EntityFields = ${record(
    project.entities.map((e) => {
      const ids = e.fields.filter((f) => f.type !== "children").map((f) => JSON.stringify(f.id));
      return `${e.id}: ${ids.join(" | ") || "never"};`;
    }),
  )};

/** 作成・更新・検索に渡す値（項目名 → 値）。保存の前に検証する。 */
export type Values<E extends EntityName> = { [K in EntityFields[E]]?: FieldValue };`);

  out.push(`/** データ（ルートのエンティティ → レコード。入れ子のエンティティは親のレコードの中）。 */
export type Dataset = ${record(roots.map((e) => `${e.id}: ${e.id}[];`))};

/** 式の data: エンティティごとの一覧（入れ子のエンティティは全親の子を並べたもの。読み取り専用）。 */
export type DataView = ${record(project.entities.map((e) => `/** ${doc(e)} */\nreadonly ${e.id}: readonly ${e.id}[];`))};`);

  out.push(`/** 利用者が定義した状態（state）。 */
export type UiState = ${record(Object.entries(project.state).map(([k, v]) => `${propKey(k)}: ${jsonType(v)};`))};

/** 式の state.selection: 選択中のレコード（無ければ null）。 */
export type Selected = ${record(project.entities.map((e) => `${e.id}: ${e.id} | null;`))};

/** 式の state: 利用者が定義した状態と、選択中のレコード。 */
export type ScopeState = UiState & { selection: Selected };`);

  out.push(`/** 画面 id → パラメータ。 */
export type ScreenParams = ${record(project.screens.map((s) => `/** ${s.name} */\n${propKey(s.id)}: ${paramsType(s)};`))};

export type ScreenName = keyof ScreenParams;

/** ダイアログ id → パラメータ。 */
export type DialogParams = ${record(project.dialogs.map((d) => `/** ${d.name} */\n${propKey(d.id)}: ${paramsType(d)};`))};

export type DialogName = keyof DialogParams;`);
  return `${out.join("\n\n")}\n`;
}

// ---- schema.ts ----

export function emitSchema(project: Project): string {
  return `import type { Schema } from "../runtime/datastore";

/** ER（エンティティの定義）。データの検証・採番・入れ子・削除の規則に使う。 */
export const schema: Schema = ${literal(toRuntimeSchema(project))};
`;
}

// ---- data.ts ----

export function emitData(project: Project): string {
  const nest = nestParents(project.entities);
  const roots = project.entities.filter((e) => !nest.has(e.id));
  const data = Object.fromEntries(roots.map((e) => [e.id, project.data[e.id] ?? []]));
  return `import type { Dataset, UiState } from "./types";

/** サンプルデータ（エディタで作ったもの。入れ子のエンティティは親のレコードの中）。 */
export const sampleData: Dataset = ${literal(data)};

/** state の初期値。 */
export const initialState: UiState = ${literal(project.state)};
`;
}
