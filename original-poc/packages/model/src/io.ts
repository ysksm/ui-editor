import { isRecord } from "./data.js";
import { entityMap } from "./er.js";
import type { Issue } from "./issues.js";
import {
  SCHEMA_VERSION,
  type DataRecord,
  type Entity,
  type Layout,
  type Project,
} from "./schema.js";
import { validateProject, type ValidationResult } from "./validate.js";

/** プロジェクトファイル（JSON）の読み書き（architecture.md 4.10・4.11）。 */

export class ProjectParseError extends Error {
  override name = "ProjectParseError";
}

/** テキストを JSON として読む（検証はしない）。 */
export function parseProjectText(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch (e) {
    throw new ProjectParseError(`JSON の構文エラー: ${(e as Error).message}`);
  }
}

// ---- 移行 ----

/** 古い版 → 次の版への変換。キーは変換前の schemaVersion。 */
export type Migrations = Readonly<
  Record<string, (raw: Record<string, unknown>) => Record<string, unknown>>
>;

/**
 * 版ごとの移行関数。互換が崩れる変更をしたら、ここに「前の版 → 新しい版」を足す。
 * 例: `"poc-0": (raw) => ({ ...raw, schemaVersion: "poc-1", ... })`
 */
export const MIGRATIONS: Migrations = {};

export interface MigrateResult {
  value: unknown;
  /** 移行前の版（移行しなかったら undefined）。 */
  from: string | undefined;
  issues: Issue[];
}

/** schemaVersion を見て、今の版になるまで移行関数を順に通す。 */
export function migrate(raw: unknown, migrations: Migrations = MIGRATIONS): MigrateResult {
  if (!isRecord(raw) || typeof raw.schemaVersion !== "string") {
    return { value: raw, from: undefined, issues: [] };
  }
  const from = raw.schemaVersion;
  let current: Record<string, unknown> = raw;
  const seen = new Set<string>();
  while (current.schemaVersion !== SCHEMA_VERSION) {
    const version = String(current.schemaVersion);
    const step = migrations[version];
    if (!step || seen.has(version)) {
      return {
        value: current,
        from: undefined,
        issues: [
          {
            path: ["schemaVersion"],
            message: `schemaVersion "${version}" には対応していません（${SCHEMA_VERSION} のファイルを開いてください）`,
            severity: "error",
          },
        ],
      };
    }
    seen.add(version);
    current = step(current);
  }
  return { value: current, from: from === SCHEMA_VERSION ? undefined : from, issues: [] };
}

/** テキスト → 移行 → 形の検証 → 参照の検証。 */
export function loadProject(text: string): ValidationResult {
  const migrated = migrate(parseProjectText(text));
  if (migrated.issues.length > 0) return { success: false, issues: migrated.issues };
  return validateProject(migrated.value);
}

// ---- 決定的な書き出し ----

/** 決定的に書き出す。同じ内容なら、入力のキー順に関係なく同じテキストになる。 */
export function serializeProject(project: Project): string {
  return `${JSON.stringify(canonicalProject(project), null, 2)}\n`;
}

/**
 * キーの並び順。ここに無いキーは後ろにアルファベット順で並べる。
 * id・type・name を先頭に、中身（root / children / data）と見た目（layout）を末尾にしている。
 */
const KEY_ORDER = [
  "$schema",
  "schemaVersion",
  "id",
  "type",
  "name",
  "description",
  "entry",
  "kind",
  "entity",
  "path",
  "primaryKey",
  "displayField",
  "required",
  "default",
  "values",
  "onDelete",
  "cardinality",
  "format",
  "min",
  "max",
  "to",
  "dialog",
  "parent",
  "match",
  "set",
  "field",
  "header",
  "value",
  "result",
  "params",
  "onClose",
  "when",
  "placeholder",
  "props",
  "style",
  "repeat",
  "visible",
  "events",
  "each",
  "as",
  "key",
  "fields",
  "entities",
  "state",
  "screens",
  "dialogs",
  "root",
  "children",
  "data",
  "layout",
];
const KEY_RANK = new Map(KEY_ORDER.map((k, i) => [k, i]));

function compareKeys(a: string, b: string): number {
  const ra = KEY_RANK.get(a) ?? KEY_ORDER.length;
  const rb = KEY_RANK.get(b) ?? KEY_ORDER.length;
  if (ra !== rb) return ra - rb;
  return a < b ? -1 : a > b ? 1 : 0;
}

/** キーを KEY_ORDER → アルファベット順に並べ替え、undefined を取り除いた値を返す。 */
export function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value).sort(compareKeys)) {
      const v = (value as Record<string, unknown>)[key];
      if (v !== undefined) out[key] = canonicalize(v);
    }
    return out;
  }
  return value;
}

/** プロジェクトを決定的な形にする。データはエンティティのフィールド順、配置は id 順で整数。 */
export function canonicalProject(project: Project): Project {
  const { data, layout, ...rest } = project;
  const all: Record<string, unknown> = {
    ...(canonicalize(rest) as Record<string, unknown>),
    data: canonicalData(project.entities, data),
  };
  if (layout !== undefined) all.layout = canonicalLayout(layout);
  // data の中はフィールド順なので、canonicalize に通さず最上位のキーだけ並べる
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(all).sort(compareKeys)) out[key] = all[key];
  return out as Project;
}

function canonicalData(entities: readonly Entity[], data: Project["data"]): Project["data"] {
  const byId = entityMap({ entities: [...entities] });
  const order = new Map(entities.map((e, i) => [e.id, i]));
  const keys = Object.keys(data).sort((a, b) => {
    const d = (order.get(a) ?? entities.length) - (order.get(b) ?? entities.length);
    return d !== 0 ? d : compareKeys(a, b);
  });
  const out: Project["data"] = {};
  for (const key of keys) {
    const entity = byId.get(key);
    out[key] = (data[key] ?? []).map((r) =>
      entity ? canonicalRecord(byId, entity, r) : (canonicalize(r) as DataRecord),
    );
  }
  return out;
}

/** レコードのキーをフィールド順に並べる（子のレコードも）。定義に無いキーは後ろに回す。 */
function canonicalRecord(
  byId: ReadonlyMap<string, Entity>,
  entity: Entity,
  record: DataRecord,
): DataRecord {
  const out: DataRecord = {};
  for (const f of entity.fields) {
    const v = record[f.id];
    if (v === undefined) continue;
    const child = f.type === "children" && f.entity ? byId.get(f.entity) : undefined;
    if (child && Array.isArray(v)) {
      out[f.id] = v.map((c) => (isRecord(c) ? canonicalRecord(byId, child, c) : c));
    } else if (child && isRecord(v)) {
      out[f.id] = canonicalRecord(byId, child, v);
    } else {
      out[f.id] = canonicalize(v) as DataRecord[string];
    }
  }
  const known = new Set(entity.fields.map((f) => f.id));
  for (const key of Object.keys(record).sort(compareKeys)) {
    const v = record[key];
    if (!known.has(key) && v !== undefined) out[key] = canonicalize(v) as DataRecord[string];
  }
  return out;
}

function canonicalLayout(layout: Layout): Layout {
  const positions = (map: Record<string, { x: number; y: number }> | undefined) => {
    if (map === undefined) return undefined;
    const out: Record<string, { x: number; y: number }> = {};
    for (const id of Object.keys(map).sort()) {
      const p = map[id]!;
      out[id] = { x: Math.round(p.x), y: Math.round(p.y) };
    }
    return out;
  };
  const out: Layout = {};
  const er = positions(layout.er);
  const flow = positions(layout.flow);
  if (er) out.er = er;
  if (flow) out.flow = flow;
  return out;
}

/** 新しい空のプロジェクト。 */
export function createEmptyProject(name = "新しいプロジェクト"): Project {
  return {
    schemaVersion: SCHEMA_VERSION,
    name,
    entities: [],
    data: {},
    state: {},
    screens: [],
    dialogs: [],
  };
}
