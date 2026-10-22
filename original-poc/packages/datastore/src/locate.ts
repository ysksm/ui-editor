import {
  entityMap,
  isRecord,
  nestParents,
  type DataRecord,
  type Entity,
  type NestInfo,
  type Project,
} from "@ui-editor/poc-model";

/** サンプルデータ（ルートのエンティティ → レコードの配列。子は親の中に入れ子）。 */
export type Dataset = Project["data"];
/** ER（エンティティ定義）。 */
export type Schema = Pick<Project, "entities">;

export interface Location {
  entity: Entity;
  record: DataRecord;
  /** `data` の中の位置。例: `["Device", 0, "alarms", 2]` */
  path: (string | number)[];
  /** 入れ子の親（ルートのレコードなら undefined）。 */
  parent: { entity: Entity; record: DataRecord; field: string } | undefined;
}

export interface DataIndex {
  /** エンティティ id → レコードの位置（木の深さ優先・配列の順）。 */
  byEntity: ReadonlyMap<string, readonly Location[]>;
  /** エンティティ id → 主キー → 位置。 */
  byId: ReadonlyMap<string, ReadonlyMap<string, Location>>;
}

/** ER を引くための表（エンティティ定義ごとに作り直す）。 */
export interface Er {
  entities: ReadonlyMap<string, Entity>;
  nest: ReadonlyMap<string, NestInfo>;
}

const erCache = new WeakMap<readonly Entity[], Er>();

export function compileEr(schema: Schema): Er {
  let er = erCache.get(schema.entities);
  if (!er) {
    er = { entities: entityMap(schema), nest: nestParents(schema.entities) };
    erCache.set(schema.entities, er);
  }
  return er;
}

const indexCache = new WeakMap<Dataset, { entities: readonly Entity[]; index: DataIndex }>();

/** 主キーと位置の索引。同じ `data`・同じエンティティ定義なら作り直さない。 */
export function indexData(schema: Schema, data: Dataset): DataIndex {
  const cached = indexCache.get(data);
  if (cached && cached.entities === schema.entities) return cached.index;
  const er = compileEr(schema);
  const byEntity = new Map<string, Location[]>();
  const byId = new Map<string, Map<string, Location>>();
  const add = (loc: Location) => {
    let list = byEntity.get(loc.entity.id);
    if (!list) byEntity.set(loc.entity.id, (list = []));
    list.push(loc);
    const id = loc.record[loc.entity.primaryKey];
    if (typeof id === "string") {
      let ids = byId.get(loc.entity.id);
      if (!ids) byId.set(loc.entity.id, (ids = new Map()));
      if (!ids.has(id)) ids.set(id, loc);
    }
  };
  const walk = (
    entity: Entity,
    record: DataRecord,
    path: Location["path"],
    parent: Location["parent"],
  ) => {
    add({ entity, record, path, parent });
    for (const f of entity.fields) {
      if (f.type !== "children" || !f.entity) continue;
      const child = er.entities.get(f.entity);
      if (!child) continue;
      const v = record[f.id];
      const me = { entity, record, field: f.id };
      if (Array.isArray(v)) {
        v.forEach((c, i) => {
          if (isRecord(c)) walk(child, c, [...path, f.id, i], me);
        });
      } else if (isRecord(v)) {
        walk(child, v, [...path, f.id], me);
      }
    }
  };
  for (const [entityId, records] of Object.entries(data)) {
    const entity = er.entities.get(entityId);
    if (!entity) continue;
    records.forEach((r, i) => walk(entity, r, [entityId, i], undefined));
  }
  const index: DataIndex = { byEntity, byId };
  indexCache.set(data, { entities: schema.entities, index });
  return index;
}

/** 主キーでレコードを探す。 */
export function findRecord(
  schema: Schema,
  data: Dataset,
  entityId: string,
  id: string,
): Location | undefined {
  return indexData(schema, data).byId.get(entityId)?.get(id);
}

/** エンティティのレコードを、木の中の順に平らに並べる。 */
export function listRecords(schema: Schema, data: Dataset, entityId: string): DataRecord[] {
  return (indexData(schema, data).byEntity.get(entityId) ?? []).map((l) => l.record);
}

const viewCache = new WeakMap<Dataset, { entities: readonly Entity[]; view: DataView }>();

/** 式の `data` に渡す形。ルートのエンティティは入れ子のまま、入れ子のエンティティは全親の子を並べた一覧。 */
export type DataView = Readonly<Record<string, readonly DataRecord[]>>;

export function dataView(schema: Schema, data: Dataset): DataView {
  const cached = viewCache.get(data);
  if (cached && cached.entities === schema.entities) return cached.view;
  const er = compileEr(schema);
  const view: Record<string, readonly DataRecord[]> = {};
  for (const e of schema.entities) {
    view[e.id] = er.nest.has(e.id) ? listRecords(schema, data, e.id) : (data[e.id] ?? []);
  }
  viewCache.set(data, { entities: schema.entities, view });
  return view;
}

/** レコードを人に見せるときの名前（表示用フィールド、無ければ主キー）。 */
export function describeRecord(entity: Entity, record: DataRecord): string {
  const label = entity.displayField ? record[entity.displayField] : undefined;
  const id = record[entity.primaryKey];
  if (label !== undefined && label !== null && label !== "") return String(label);
  return id === undefined || id === null ? "(主キーなし)" : String(id);
}
