import {
  checkFieldValue,
  findField,
  isBlank,
  isRecord,
  type DataRecord,
  type Entity,
  type JsonValue,
} from "@ui-editor/poc-model";
import {
  compileEr,
  describeRecord,
  findRecord,
  indexData,
  listRecords,
  type Dataset,
  type Er,
  type Schema,
} from "./locate.js";

/** データの変更の記録（プレビューのログ・生成コードのテスト用）。 */
export interface DataChange {
  kind: "create" | "update" | "delete";
  entity: string;
  id: string;
  /** update のとき、変わったフィールド。 */
  fields?: string[];
  /**
   * なぜ変わったか。
   * - `match`: 条件に合った（作成・更新・削除の対象そのもの）
   * - `nested`: 入れ子の親と一緒に消えた
   * - `cascade`: 参照先が消えたので消えた（onDelete: cascade）
   * - `setNull`: 参照先が消えたので null にした（onDelete: setNull）
   */
  reason: "match" | "nested" | "cascade" | "setNull";
}

export type DataResult<T = object> =
  | ({ ok: true; data: Dataset; changes: DataChange[] } & T)
  | { ok: false; error: string; fieldErrors?: Record<string, string> };

const fail = (error: string, fieldErrors?: Record<string, string>) =>
  ({ ok: false, error, ...(fieldErrors ? { fieldErrors } : {}) }) as const;

// ---- 木の作り直し（変わった枝だけ複製する） ----

/** null を返すとそのレコード（と子）を消す。変えないならそのまま返す。 */
type Visit = (entity: Entity, record: DataRecord) => DataRecord | null;

function rebuild(er: Er, data: Dataset, visit: Visit): Dataset {
  let changed = false;
  const out: Dataset = {};
  for (const [entityId, records] of Object.entries(data)) {
    const entity = er.entities.get(entityId);
    const next = entity ? mapList(er, entity, records, visit) : records;
    if (next !== records) changed = true;
    out[entityId] = next;
  }
  return changed ? out : data;
}

function mapList(er: Er, entity: Entity, list: readonly JsonValue[], visit: Visit): DataRecord[] {
  let changed = false;
  const out: JsonValue[] = [];
  for (const item of list) {
    const next = isRecord(item) ? mapRecord(er, entity, item, visit) : item;
    if (next !== item) changed = true;
    if (next !== null) out.push(next);
  }
  return (changed ? out : list) as DataRecord[];
}

function mapRecord(er: Er, entity: Entity, record: DataRecord, visit: Visit): DataRecord | null {
  const visited = visit(entity, record);
  if (visited === null) return null;
  let current = visited;
  for (const f of entity.fields) {
    if (f.type !== "children" || !f.entity) continue;
    const child = er.entities.get(f.entity);
    const v = current[f.id];
    if (!child || v === undefined || v === null) continue;
    let next: JsonValue;
    if (Array.isArray(v)) next = mapList(er, child, v, visit);
    else if (isRecord(v)) next = mapRecord(er, child, v, visit);
    else continue;
    if (next !== v) current = { ...current, [f.id]: next };
  }
  return current;
}

// ---- 値 ----

/** 新しいレコードの初期値（主キー以外。既定値が無ければ型ごとの空の値）。フォームの下書きにも使う。 */
export function emptyRecord(entity: Entity): DataRecord {
  const out: DataRecord = {};
  for (const f of entity.fields) {
    if (f.id === entity.primaryKey) continue;
    if (f.type === "children") out[f.id] = (f.cardinality ?? "many") === "many" ? [] : null;
    else if (f.default !== undefined) out[f.id] = f.default;
    else if (f.type === "boolean") out[f.id] = false;
    else if (f.type === "string" || f.type === "date") out[f.id] = "";
    else out[f.id] = null;
  }
  return out;
}

/**
 * レコードを検証し、フィールド id → メッセージを返す（問題が無ければ空）。
 * 必須・型・列挙値・範囲・参照先の存在・主キーの重複（`selfId` は自分自身として除く）を調べる。
 */
export function validateRecord(
  schema: Schema,
  data: Dataset,
  entityId: string,
  record: DataRecord,
  options: { selfId?: string | undefined } = {},
): Record<string, string> {
  const errors: Record<string, string> = {};
  const entity = compileEr(schema).entities.get(entityId);
  if (!entity) return { "": `エンティティ "${entityId}" がありません` };
  for (const key of Object.keys(record)) {
    if (!findField(entity, key)) errors[key] = "定義に無い項目です";
  }
  for (const f of entity.fields) {
    if (f.type === "children") continue;
    const v = record[f.id];
    if (f.id === entity.primaryKey) {
      if (isBlank(v)) errors[f.id] = "主キーがありません";
      else if (typeof v !== "string") errors[f.id] = "文字列ではありません";
      else if (v !== options.selfId && findRecord(schema, data, entityId, v))
        errors[f.id] = `主キー "${v}" は既にあります`;
      continue;
    }
    if (f.required && isBlank(v)) {
      errors[f.id] = "必須の項目です";
      continue;
    }
    const problem = checkFieldValue(f, v);
    if (problem) {
      errors[f.id] = problem;
      continue;
    }
    if (f.type === "ref" && f.entity && typeof v === "string" && v !== "") {
      if (!findRecord(schema, data, f.entity, v))
        errors[f.id] = `参照先の ${f.entity} "${v}" がありません`;
    }
  }
  return errors;
}

/**
 * 次の主キー。既にある id の「接頭辞 + 連番」（例: `dev-005` → `dev-006`）に合わせ、
 * 無ければエンティティ id から作る（`DeviceSettings` → `device-settings-001`）。
 */
export function nextId(schema: Schema, data: Dataset, entityId: string): string {
  const ids = [...(indexData(schema, data).byId.get(entityId)?.keys() ?? [])];
  const groups = new Map<string, { max: number; width: number; count: number }>();
  for (const id of ids) {
    const m = /^(.*?)(\d+)$/.exec(id);
    if (!m) continue;
    const prefix = m[1]!;
    const g = groups.get(prefix) ?? { max: 0, width: 0, count: 0 };
    g.max = Math.max(g.max, Number(m[2]));
    g.width = Math.max(g.width, m[2]!.length);
    g.count++;
    groups.set(prefix, g);
  }
  let best: [string, { max: number; width: number; count: number }] | undefined;
  for (const entry of [...groups].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) {
    if (!best || entry[1].count > best[1].count) best = entry;
  }
  const [prefix, { max, width }] = best ?? [`${kebab(entityId)}-`, { max: 0, width: 3, count: 0 }];
  const taken = new Set(ids);
  for (let n = max + 1; ; n++) {
    const id = `${prefix}${String(n).padStart(width, "0")}`;
    if (!taken.has(id)) return id;
  }
}

function kebab(id: string): string {
  return id.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();
}

function pick(errors: Record<string, string>, keys: readonly string[]): Record<string, string> {
  return Object.fromEntries(Object.entries(errors).filter(([k]) => keys.includes(k)));
}

// ---- 作成 ----

/**
 * レコードを作る。入れ子のエンティティは `parent`（親の主キー）が必要。
 * 主キーが無ければ採番し、無い項目は既定値で埋める（`emptyRecord`）。
 */
export function createRecord(
  schema: Schema,
  data: Dataset,
  entityId: string,
  values: DataRecord,
  options: {
    parent?: string | undefined;
    /**
     * false なら必須・型などを検証しない（エディタの表で空の行を足し、あとから埋めるとき）。
     * 主キーの重複と入れ子の親は常に調べる。
     */
    validate?: boolean;
  } = {},
): DataResult<{ record: DataRecord }> {
  const er = compileEr(schema);
  const entity = er.entities.get(entityId);
  if (!entity) return fail(`エンティティ "${entityId}" がありません`);
  const childKey = Object.keys(values).find((k) => findField(entity, k)?.type === "children");
  if (childKey) return fail(`children の項目 "${childKey}" は作成時に指定できません`);

  const base = { ...emptyRecord(entity), ...values };
  if (isBlank(base[entity.primaryKey])) base[entity.primaryKey] = nextId(schema, data, entityId);
  // フィールド順にそろえる（定義に無いキーは検証でエラーにするため後ろに残す）
  const record: DataRecord = {};
  for (const f of entity.fields) if (base[f.id] !== undefined) record[f.id] = base[f.id]!;
  for (const [k, v] of Object.entries(base)) if (!(k in record)) record[k] = v;

  const allErrors = validateRecord(schema, data, entityId, record);
  const fieldErrors = options.validate === false ? pick(allErrors, [entity.primaryKey]) : allErrors;
  if (Object.keys(fieldErrors).length > 0) return fail("入力に誤りがあります", fieldErrors);
  const id = record[entity.primaryKey] as string;
  const changes: DataChange[] = [{ kind: "create", entity: entityId, id, reason: "match" }];

  const nest = er.nest.get(entityId);
  if (!nest) {
    if (options.parent !== undefined)
      return fail(`"${entityId}" は入れ子のエンティティではないので、親は指定できません`);
    return {
      ok: true,
      data: { ...data, [entityId]: [...(data[entityId] ?? []), record] },
      changes,
      record,
    };
  }
  if (options.parent === undefined || options.parent === "")
    return fail(
      `"${entityId}" は ${nest.parent} の入れ子なので、親（${nest.parent}）を指定してください`,
    );
  const parent = findRecord(schema, data, nest.parent, options.parent);
  if (!parent) return fail(`親の ${nest.parent} "${options.parent}" がありません`);
  if (nest.cardinality === "one" && isRecord(parent.record[nest.field])) {
    return fail(
      `${nest.parent}「${describeRecord(parent.entity, parent.record)}」には既に ${entityId} があります（1 件だけ）`,
    );
  }
  const next = rebuild(er, data, (e, r) => {
    if (r !== parent.record) return r;
    const current = r[nest.field];
    const value =
      nest.cardinality === "one" ? record : [...(Array.isArray(current) ? current : []), record];
    return { ...r, [nest.field]: value };
  });
  return { ok: true, data: next, changes, record };
}

// ---- 更新 ----

/** 条件（フィールド = 値 の AND）に合うレコードを探す。主キーが条件にあれば索引を使う。 */
export function matchRecords(
  schema: Schema,
  data: Dataset,
  entityId: string,
  match: Readonly<Record<string, JsonValue>>,
): DataRecord[] {
  const entity = compileEr(schema).entities.get(entityId);
  if (!entity) return [];
  const pk = match[entity.primaryKey];
  const candidates =
    typeof pk === "string"
      ? [findRecord(schema, data, entityId, pk)?.record].filter((r) => r !== undefined)
      : listRecords(schema, data, entityId);
  return candidates.filter((r) => Object.entries(match).every(([k, v]) => r[k] === v));
}

/** 条件に合うレコードを更新する。主キーと children は変えられない。合うものが無ければ何もしない。 */
export function updateRecords(
  schema: Schema,
  data: Dataset,
  entityId: string,
  match: Readonly<Record<string, JsonValue>>,
  set: Readonly<Record<string, JsonValue>>,
  options: {
    /**
     * `all`（既定）はレコード全体を検証する。`changed` は変える項目だけ検証する
     * （エディタの表で、ほかの項目がまだ空・誤りのままでも 1 項目ずつ直せるように）。
     */
    validate?: "all" | "changed";
  } = {},
): DataResult {
  const er = compileEr(schema);
  const entity = er.entities.get(entityId);
  if (!entity) return fail(`エンティティ "${entityId}" がありません`);
  for (const key of Object.keys(set)) {
    const f = findField(entity, key);
    if (!f) return fail("入力に誤りがあります", { [key]: "定義に無い項目です" });
    if (f.type === "children") return fail(`children の項目 "${key}" は更新できません`);
  }
  const targets = matchRecords(schema, data, entityId, match);
  const updated = new Map<DataRecord, DataRecord>();
  const changes: DataChange[] = [];
  for (const r of targets) {
    const id = r[entity.primaryKey];
    if (entity.primaryKey in set && set[entity.primaryKey] !== id)
      return fail("主キーは変えられません", { [entity.primaryKey]: "主キーは変えられません" });
    const merged = { ...r, ...set };
    const allErrors = validateRecord(schema, data, entityId, merged, {
      selfId: typeof id === "string" ? id : undefined,
    });
    const fieldErrors =
      options.validate === "changed" ? pick(allErrors, Object.keys(set)) : allErrors;
    if (Object.keys(fieldErrors).length > 0) return fail("入力に誤りがあります", fieldErrors);
    const fields = Object.keys(set).filter((k) => r[k] !== set[k]);
    if (fields.length === 0) continue;
    updated.set(r, merged);
    changes.push({ kind: "update", entity: entityId, id: String(id), fields, reason: "match" });
  }
  if (updated.size === 0) return { ok: true, data, changes: [] };
  return { ok: true, data: rebuild(er, data, (_, r) => updated.get(r) ?? r), changes };
}

// ---- 削除 ----

/**
 * 条件に合うレコードを子ごと削除し、消えたレコードを指す `ref` の `onDelete` に従う。
 * restrict（既定）で参照が残るなら、何も変えずにエラーを返す。
 */
export function deleteRecords(
  schema: Schema,
  data: Dataset,
  entityId: string,
  match: Readonly<Record<string, JsonValue>>,
): DataResult {
  const er = compileEr(schema);
  const entity = er.entities.get(entityId);
  if (!entity) return fail(`エンティティ "${entityId}" がありません`);

  const removed = new Map<DataRecord, DataChange>();
  const remove = (e: Entity, r: DataRecord, reason: DataChange["reason"]) => {
    if (removed.has(r)) return;
    removed.set(r, { kind: "delete", entity: e.id, id: String(r[e.primaryKey]), reason });
    // 入れ子の子も消える
    for (const f of e.fields) {
      const child = f.type === "children" && f.entity ? er.entities.get(f.entity) : undefined;
      const v = r[f.id];
      if (!child) continue;
      if (Array.isArray(v)) v.forEach((c) => isRecord(c) && remove(child, c, "nested"));
      else if (isRecord(v)) remove(child, v, "nested");
    }
  };
  for (const r of matchRecords(schema, data, entityId, match)) remove(entity, r, "match");
  if (removed.size === 0) return { ok: true, data, changes: [] };

  // 参照（ref）の onDelete を、消えるものが増えなくなるまで繰り返す
  const index = indexData(schema, data);
  const refFields = schema.entities.flatMap((e) =>
    e.fields.filter((f) => f.type === "ref" && f.entity).map((f) => ({ entity: e, field: f })),
  );
  const nulled = new Map<DataRecord, { entity: Entity; fields: string[] }>();
  for (;;) {
    const removedIds = new Map<string, Set<string>>();
    for (const c of removed.values()) {
      let s = removedIds.get(c.entity);
      if (!s) removedIds.set(c.entity, (s = new Set()));
      s.add(c.id);
    }
    const blockers: string[] = [];
    let grew = false;
    for (const { entity: e, field: f } of refFields) {
      const targets = removedIds.get(f.entity!);
      if (!targets) continue;
      for (const loc of index.byEntity.get(e.id) ?? []) {
        const r = loc.record;
        const v = r[f.id];
        if (removed.has(r) || typeof v !== "string" || !targets.has(v)) continue;
        const onDelete = f.onDelete ?? "restrict";
        if (onDelete === "cascade") {
          remove(e, r, "cascade");
          grew = true;
        } else if (onDelete === "setNull" && !f.required) {
          const entry = nulled.get(r) ?? { entity: e, fields: [] };
          if (!entry.fields.includes(f.id))
            nulled.set(r, { entity: e, fields: [...entry.fields, f.id] });
        } else {
          blockers.push(`${e.name}「${describeRecord(e, r)}」の ${f.name ?? f.id}`);
        }
      }
    }
    if (blockers.length > 0) {
      const more = blockers.length > 3 ? ` ほか ${blockers.length - 3} 件` : "";
      return fail(`参照されているため削除できません: ${blockers.slice(0, 3).join("、")}${more}`);
    }
    if (!grew) break;
  }

  const changes = [...removed.values()];
  for (const [r, { entity: e, fields }] of nulled) {
    if (removed.has(r)) continue;
    changes.push({
      kind: "update",
      entity: e.id,
      id: String(r[e.primaryKey]),
      fields,
      reason: "setNull",
    });
  }
  const next = rebuild(er, data, (_, r) => {
    if (removed.has(r)) return null;
    const entry = nulled.get(r);
    if (!entry) return r;
    return { ...r, ...Object.fromEntries(entry.fields.map((f) => [f, null])) };
  });
  return { ok: true, data: next, changes };
}

// ---- 平らな形 ----

/**
 * 入れ子をほどいて、エンティティごとの平らな配列にする（書き出し用）。
 * children の項目は除き、入れ子の子には親の主キーを `$parent` として付ける。
 */
export function toFlat(schema: Schema, data: Dataset): Record<string, DataRecord[]> {
  const er = compileEr(schema);
  const index = indexData(schema, data);
  const out: Record<string, DataRecord[]> = {};
  for (const e of schema.entities) {
    out[e.id] = (index.byEntity.get(e.id) ?? []).map((loc) => {
      const r: DataRecord = {};
      for (const f of e.fields) {
        if (f.type !== "children" && loc.record[f.id] !== undefined) r[f.id] = loc.record[f.id]!;
      }
      if (er.nest.has(e.id) && loc.parent) {
        r.$parent = loc.parent.record[loc.parent.entity.primaryKey] ?? null;
      }
      return r;
    });
  }
  return out;
}
