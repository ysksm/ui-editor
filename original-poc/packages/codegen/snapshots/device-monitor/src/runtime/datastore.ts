/**
 * 入れ子のデータの検索・作成・更新・削除。エディタのプレビューと同じ規則で動く。
 *
 * - 主キーが無ければ採番する（既にある id の「接頭辞 + 連番」に合わせる。例: dev-005 → dev-006）
 * - 必須・型・列挙値・範囲・参照先の存在・主キーの重複を検証する
 * - 入れ子のエンティティ（例: 機器のアラーム）は親のレコードの中に作る
 * - 削除は子ごと。消えたレコードを指す参照は onDelete（cascade / setNull / restrict）に従う
 *
 * データは書き換えず、変わった枝だけ複製した新しいデータを返す。
 */

/** 項目の値（フォームの入力・作成と更新に渡す値）。保存の前に検証する。 */
export type FieldValue = string | number | boolean | null;

export type DataRecord = Record<string, unknown>;

/** ルートのエンティティ id → レコードの配列（入れ子のエンティティは親のレコードの中）。 */
export type Data = Record<string, DataRecord[]>;

export interface FieldDef {
  id: string;
  name?: string;
  type: "id" | "string" | "number" | "boolean" | "date" | "enum" | "ref" | "children";
  required?: boolean;
  default?: FieldValue;
  /** enum の値。 */
  values?: readonly string[];
  /** ref の参照先 / children の子のエンティティ。 */
  entity?: string;
  /** ref: 参照先が消えたときの扱い（既定 restrict）。 */
  onDelete?: "cascade" | "setNull" | "restrict";
  /** children: 子の配列（many、既定）か 1 件（one）か。 */
  cardinality?: "many" | "one";
  min?: number;
  max?: number;
}

export interface EntityDef {
  id: string;
  name: string;
  primaryKey: string;
  displayField?: string;
  fields: readonly FieldDef[];
}

/** 入れ子のエンティティの親（親のエンティティ・親の項目・1 件か複数か）。 */
export interface NestDef {
  parent: string;
  field: string;
  cardinality: "many" | "one";
}

export interface Schema {
  entities: readonly EntityDef[];
  /** 入れ子のエンティティ id → 親。 */
  nest: Readonly<Record<string, NestDef>>;
}

/** データの変更の記録。 */
export interface DataChange {
  kind: "create" | "update" | "delete";
  entity: string;
  id: string;
  /** update のとき、変わった項目。 */
  fields?: string[];
  /** match: 対象そのもの / nested: 親と一緒に消えた / cascade・setNull: 参照先が消えた。 */
  reason: "match" | "nested" | "cascade" | "setNull";
}

export type DataResult<D extends Data = Data, T = object> =
  | ({ ok: true; data: D; changes: DataChange[] } & T)
  | { ok: false; error: string; fieldErrors?: Record<string, string> };

const fail = (error: string, fieldErrors?: Record<string, string>) =>
  ({ ok: false, error, ...(fieldErrors ? { fieldErrors } : {}) }) as const;

export function isRecord(value: unknown): value is DataRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** 必須の判定で「無い」とみなす値。 */
export function isBlank(value: unknown): boolean {
  return value === undefined || value === null || value === "";
}

export function entityOf(schema: Schema, entityId: string): EntityDef | undefined {
  return schema.entities.find((e) => e.id === entityId);
}

// ---- 索引 ----

export interface Location {
  entity: EntityDef;
  record: DataRecord;
  /** 入れ子の親（ルートのレコードなら undefined）。 */
  parent: { entity: EntityDef; record: DataRecord; field: string } | undefined;
}

interface DataIndex {
  /** エンティティ id → レコードの位置（木の深さ優先・配列の順）。 */
  byEntity: Map<string, Location[]>;
  /** エンティティ id → 主キー → 位置。 */
  byId: Map<string, Map<string, Location>>;
}

const indexCache = new WeakMap<Data, DataIndex>();

function indexData(schema: Schema, data: Data): DataIndex {
  const cached = indexCache.get(data);
  if (cached) return cached;
  const index: DataIndex = { byEntity: new Map(), byId: new Map() };
  const add = (loc: Location) => {
    const list = index.byEntity.get(loc.entity.id) ?? [];
    list.push(loc);
    index.byEntity.set(loc.entity.id, list);
    const id = loc.record[loc.entity.primaryKey];
    if (typeof id !== "string") return;
    const ids = index.byId.get(loc.entity.id) ?? new Map<string, Location>();
    if (!ids.has(id)) ids.set(id, loc);
    index.byId.set(loc.entity.id, ids);
  };
  const walk = (entity: EntityDef, record: DataRecord, parent: Location["parent"]) => {
    add({ entity, record, parent });
    for (const f of entity.fields) {
      const child = f.type === "children" && f.entity ? entityOf(schema, f.entity) : undefined;
      if (!child) continue;
      const v = record[f.id];
      const me = { entity, record, field: f.id };
      if (Array.isArray(v)) v.forEach((c) => isRecord(c) && walk(child, c, me));
      else if (isRecord(v)) walk(child, v, me);
    }
  };
  for (const [entityId, records] of Object.entries(data)) {
    const entity = entityOf(schema, entityId);
    if (entity) records.forEach((r) => walk(entity, r, undefined));
  }
  indexCache.set(data, index);
  return index;
}

/** 主キーでレコードを探す。 */
export function findRecord(
  schema: Schema,
  data: Data,
  entityId: string,
  id: string,
): Location | undefined {
  return indexData(schema, data).byId.get(entityId)?.get(id);
}

/** エンティティのレコードを、木の中の順に平らに並べる。 */
export function listRecords(schema: Schema, data: Data, entityId: string): DataRecord[] {
  return (indexData(schema, data).byEntity.get(entityId) ?? []).map((l) => l.record);
}

const viewCache = new WeakMap<Data, Record<string, readonly DataRecord[]>>();

/** 式の data。ルートのエンティティは入れ子のまま、入れ子のエンティティは全親の子を並べた一覧。 */
export function dataView(schema: Schema, data: Data): Record<string, readonly DataRecord[]> {
  let view = viewCache.get(data);
  if (!view) {
    view = {};
    for (const e of schema.entities) {
      view[e.id] = schema.nest[e.id] ? listRecords(schema, data, e.id) : (data[e.id] ?? []);
    }
    viewCache.set(data, view);
  }
  return view;
}

/** レコードを人に見せるときの名前（表示用の項目、無ければ主キー）。 */
export function describeRecord(entity: EntityDef, record: DataRecord): string {
  const label = entity.displayField ? record[entity.displayField] : undefined;
  const id = record[entity.primaryKey];
  if (label !== undefined && label !== null && label !== "") return String(label);
  return id === undefined || id === null ? "(主キーなし)" : String(id);
}

// ---- 値と検証 ----

/** 新しいレコードの初期値（主キー以外。既定値が無ければ型ごとの空の値）。フォームの下書きにも使う。 */
export function emptyRecord(entity: EntityDef): DataRecord {
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

const ISO_DATE = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?)?$/;

/** 項目の値の型を調べ、合わなければ理由を返す（null は通す。必須の判定は呼び出し側）。 */
export function checkFieldValue(field: FieldDef, value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  switch (field.type) {
    case "id":
    case "string":
      return typeof value === "string" ? undefined : "文字列ではありません";
    case "ref":
      return typeof value === "string" ? undefined : "参照先の主キー（文字列）ではありません";
    case "number":
      if (typeof value !== "number" || !Number.isFinite(value)) return "数値ではありません";
      if (field.min !== undefined && value < field.min) return `${field.min} 以上にしてください`;
      if (field.max !== undefined && value > field.max) return `${field.max} 以下にしてください`;
      return undefined;
    case "boolean":
      return typeof value === "boolean" ? undefined : "true / false ではありません";
    case "date":
      return typeof value === "string" && ISO_DATE.test(value) && !Number.isNaN(Date.parse(value))
        ? undefined
        : "日付（ISO 8601。例: 2026-10-23 / 2026-10-23T09:00:00Z）ではありません";
    case "enum":
      return typeof value === "string" && (field.values ?? []).includes(value)
        ? undefined
        : `${(field.values ?? []).join(" / ")} のどれかにしてください`;
    case "children":
      return undefined;
  }
}

/**
 * レコードを検証し、項目 id → メッセージを返す（問題が無ければ空）。
 * 必須・型・列挙値・範囲・参照先の存在・主キーの重複（`selfId` は自分自身として除く）を調べる。
 */
export function validateRecord(
  schema: Schema,
  data: Data,
  entityId: string,
  record: DataRecord,
  options: { selfId?: string | undefined } = {},
): Record<string, string> {
  const errors: Record<string, string> = {};
  const entity = entityOf(schema, entityId);
  if (!entity) return { "": `エンティティ "${entityId}" がありません` };
  for (const key of Object.keys(record)) {
    if (!entity.fields.some((f) => f.id === key)) errors[key] = "定義に無い項目です";
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

/** 次の主キー。既にある id の「接頭辞 + 連番」に合わせ、無ければエンティティ id から作る。 */
export function nextId(schema: Schema, data: Data, entityId: string): string {
  const ids = [...(indexData(schema, data).byId.get(entityId)?.keys() ?? [])];
  const groups = new Map<string, { max: number; width: number; count: number }>();
  for (const id of ids) {
    const m = /^(.*?)(\d+)$/.exec(id);
    if (!m) continue;
    const prefix = m[1] ?? "";
    const digits = m[2] ?? "";
    const g = groups.get(prefix) ?? { max: 0, width: 0, count: 0 };
    g.max = Math.max(g.max, Number(digits));
    g.width = Math.max(g.width, digits.length);
    g.count++;
    groups.set(prefix, g);
  }
  let best: [string, { max: number; width: number; count: number }] | undefined;
  for (const entry of [...groups].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) {
    if (!best || entry[1].count > best[1].count) best = entry;
  }
  const kebab = entityId.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();
  const [prefix, { max, width }] = best ?? [`${kebab}-`, { max: 0, width: 3, count: 0 }];
  const taken = new Set(ids);
  for (let n = max + 1; ; n++) {
    const id = `${prefix}${String(n).padStart(width, "0")}`;
    if (!taken.has(id)) return id;
  }
}

// ---- 木の作り直し（変わった枝だけ複製する） ----

/** null を返すとそのレコード（と子）を消す。変えないならそのまま返す。 */
type Visit = (entity: EntityDef, record: DataRecord) => DataRecord | null;

function rebuild<D extends Data>(schema: Schema, data: D, visit: Visit): D {
  let changed = false;
  const out: Data = {};
  for (const [entityId, records] of Object.entries(data)) {
    const entity = entityOf(schema, entityId);
    const next = entity ? mapList(schema, entity, records, visit) : records;
    if (next !== records) changed = true;
    out[entityId] = next;
  }
  return changed ? (out as D) : data;
}

function mapList(
  schema: Schema,
  entity: EntityDef,
  list: readonly unknown[],
  visit: Visit,
): DataRecord[] {
  let changed = false;
  const out: unknown[] = [];
  for (const item of list) {
    const next = isRecord(item) ? mapRecord(schema, entity, item, visit) : item;
    if (next !== item) changed = true;
    if (next !== null) out.push(next);
  }
  return (changed ? out : list) as DataRecord[];
}

function mapRecord(
  schema: Schema,
  entity: EntityDef,
  record: DataRecord,
  visit: Visit,
): DataRecord | null {
  const visited = visit(entity, record);
  if (visited === null) return null;
  let current = visited;
  for (const f of entity.fields) {
    const child = f.type === "children" && f.entity ? entityOf(schema, f.entity) : undefined;
    const v = current[f.id];
    if (!child || v === undefined || v === null) continue;
    let next: unknown;
    if (Array.isArray(v)) next = mapList(schema, child, v, visit);
    else if (isRecord(v)) next = mapRecord(schema, child, v, visit);
    else continue;
    if (next !== v) current = { ...current, [f.id]: next };
  }
  return current;
}

// ---- 作成 ----

/**
 * レコードを作る。入れ子のエンティティは `parent`（親の主キー）が必要。
 * 主キーが無ければ採番し、無い項目は既定値で埋める（`emptyRecord`）。
 */
export function createRecord<D extends Data>(
  schema: Schema,
  data: D,
  entityId: string,
  values: Readonly<Record<string, unknown>>,
  parent?: string,
): DataResult<D, { record: DataRecord }> {
  const entity = entityOf(schema, entityId);
  if (!entity) return fail(`エンティティ "${entityId}" がありません`);
  const childKey = Object.keys(values).find(
    (k) => entity.fields.find((f) => f.id === k)?.type === "children",
  );
  if (childKey) return fail(`children の項目 "${childKey}" は作成時に指定できません`);

  const base: DataRecord = { ...emptyRecord(entity), ...values };
  if (isBlank(base[entity.primaryKey])) base[entity.primaryKey] = nextId(schema, data, entityId);
  // 項目の順にそろえる（定義に無いキーは検証でエラーにするため後ろに残す）
  const record: DataRecord = {};
  for (const f of entity.fields) if (base[f.id] !== undefined) record[f.id] = base[f.id];
  for (const [k, v] of Object.entries(base)) if (!(k in record)) record[k] = v;

  const fieldErrors = validateRecord(schema, data, entityId, record);
  if (Object.keys(fieldErrors).length > 0) return fail("入力に誤りがあります", fieldErrors);
  const id = record[entity.primaryKey] as string;
  const changes: DataChange[] = [{ kind: "create", entity: entityId, id, reason: "match" }];

  const nest = schema.nest[entityId];
  if (!nest) {
    if (parent !== undefined)
      return fail(`"${entityId}" は入れ子のエンティティではないので、親は指定できません`);
    const next = { ...data, [entityId]: [...(data[entityId] ?? []), record] };
    return { ok: true, data: next, changes, record };
  }
  if (parent === undefined || parent === "")
    return fail(
      `"${entityId}" は ${nest.parent} の入れ子なので、親（${nest.parent}）を指定してください`,
    );
  const owner = findRecord(schema, data, nest.parent, parent);
  if (!owner) return fail(`親の ${nest.parent} "${parent}" がありません`);
  if (nest.cardinality === "one" && isRecord(owner.record[nest.field])) {
    return fail(
      `${nest.parent}「${describeRecord(owner.entity, owner.record)}」には既に ${entityId} があります（1 件だけ）`,
    );
  }
  const next = rebuild(schema, data, (_, r) => {
    if (r !== owner.record) return r;
    const current = r[nest.field];
    const value =
      nest.cardinality === "one" ? record : [...(Array.isArray(current) ? current : []), record];
    return { ...r, [nest.field]: value };
  });
  return { ok: true, data: next, changes, record };
}

// ---- 更新 ----

/** 条件（項目 = 値 の AND）に合うレコードを探す。主キーが条件にあれば索引を使う。 */
export function matchRecords(
  schema: Schema,
  data: Data,
  entityId: string,
  match: Readonly<Record<string, unknown>>,
): DataRecord[] {
  const entity = entityOf(schema, entityId);
  if (!entity) return [];
  const pk = match[entity.primaryKey];
  const candidates =
    typeof pk === "string"
      ? [findRecord(schema, data, entityId, pk)?.record].filter((r) => r !== undefined)
      : listRecords(schema, data, entityId);
  return candidates.filter((r) => Object.entries(match).every(([k, v]) => r[k] === v));
}

/** 条件に合うレコードを更新する。主キーと children は変えられない。合うものが無ければ何もしない。 */
export function updateRecords<D extends Data>(
  schema: Schema,
  data: D,
  entityId: string,
  match: Readonly<Record<string, unknown>>,
  set: Readonly<Record<string, unknown>>,
): DataResult<D> {
  const entity = entityOf(schema, entityId);
  if (!entity) return fail(`エンティティ "${entityId}" がありません`);
  for (const key of Object.keys(set)) {
    const f = entity.fields.find((x) => x.id === key);
    if (!f) return fail("入力に誤りがあります", { [key]: "定義に無い項目です" });
    if (f.type === "children") return fail(`children の項目 "${key}" は更新できません`);
  }
  const updated = new Map<DataRecord, DataRecord>();
  const changes: DataChange[] = [];
  for (const r of matchRecords(schema, data, entityId, match)) {
    const id = r[entity.primaryKey];
    if (entity.primaryKey in set && set[entity.primaryKey] !== id)
      return fail("主キーは変えられません", { [entity.primaryKey]: "主キーは変えられません" });
    const merged = { ...r, ...set };
    const fieldErrors = validateRecord(schema, data, entityId, merged, {
      selfId: typeof id === "string" ? id : undefined,
    });
    if (Object.keys(fieldErrors).length > 0) return fail("入力に誤りがあります", fieldErrors);
    const fields = Object.keys(set).filter((k) => r[k] !== set[k]);
    if (fields.length === 0) continue;
    updated.set(r, merged);
    changes.push({ kind: "update", entity: entityId, id: String(id), fields, reason: "match" });
  }
  if (updated.size === 0) return { ok: true, data, changes: [] };
  return { ok: true, data: rebuild(schema, data, (_, r) => updated.get(r) ?? r), changes };
}

// ---- 削除 ----

/**
 * 条件に合うレコードを子ごと削除し、消えたレコードを指す参照（ref）の onDelete に従う。
 * restrict（既定）で参照が残るなら、何も変えずにエラーを返す。
 */
export function deleteRecords<D extends Data>(
  schema: Schema,
  data: D,
  entityId: string,
  match: Readonly<Record<string, unknown>>,
): DataResult<D> {
  const entity = entityOf(schema, entityId);
  if (!entity) return fail(`エンティティ "${entityId}" がありません`);

  const removed = new Map<DataRecord, DataChange>();
  const remove = (e: EntityDef, r: DataRecord, reason: DataChange["reason"]) => {
    if (removed.has(r)) return;
    removed.set(r, { kind: "delete", entity: e.id, id: String(r[e.primaryKey]), reason });
    // 入れ子の子も消える
    for (const f of e.fields) {
      const child = f.type === "children" && f.entity ? entityOf(schema, f.entity) : undefined;
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
  const nulled = new Map<DataRecord, { entity: EntityDef; fields: string[] }>();
  for (;;) {
    const removedIds = new Map<string, Set<string>>();
    for (const c of removed.values()) {
      const ids = removedIds.get(c.entity) ?? new Set<string>();
      ids.add(c.id);
      removedIds.set(c.entity, ids);
    }
    const blockers: string[] = [];
    let grew = false;
    for (const { entity: e, field: f } of refFields) {
      const targets = f.entity ? removedIds.get(f.entity) : undefined;
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
  const next = rebuild(schema, data, (_, r) => {
    if (removed.has(r)) return null;
    const entry = nulled.get(r);
    if (!entry) return r;
    return { ...r, ...Object.fromEntries(entry.fields.map((f) => [f, null])) };
  });
  return { ok: true, data: next, changes };
}
