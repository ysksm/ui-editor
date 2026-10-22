import { base, en, Faker, ja } from "@faker-js/faker";
import {
  nestParents,
  type DataRecord,
  type Entity,
  type Field,
  type JsonValue,
  type Project,
} from "@ui-editor/poc-model";

export interface SeedOptions {
  /**
   * エンティティ id → 件数。入れ子のエンティティは全親の合計。
   * 省略したものは `defaultCounts` の値（ルート 5 件、入れ子は親 1 件あたり 3 件、1 件だけの子は親と同じ数）。
   */
  counts?: Readonly<Record<string, number>>;
  /** 乱数のシード（既定 1）。同じシード・同じ ER なら同じデータになる。 */
  seed?: number;
  /** 日付を作る基準の日時（既定 2026-10-01T00:00:00Z）。実行した日に左右されないように固定する。 */
  refDate?: string;
}

export interface SeedResult {
  data: Project["data"];
  /** 実際に作った件数（エンティティ id → 件数）。 */
  counts: Record<string, number>;
  warnings: string[];
}

export const DEFAULT_SEED = 1;
export const DEFAULT_REF_DATE = "2026-10-01T00:00:00.000Z";
const ROOT_COUNT = 5;
const CHILDREN_PER_PARENT = 3;

/** 件数の既定値。入れ子のエンティティは親の件数から決める。 */
export function defaultCounts(
  entities: readonly Entity[],
  given: Readonly<Record<string, number>> = {},
): Record<string, number> {
  const nest = nestParents(entities);
  const out: Record<string, number> = {};
  const resolve = (id: string, seen: Set<string>): number => {
    if (out[id] !== undefined) return out[id];
    const info = nest.get(id);
    let n: number;
    if (given[id] !== undefined) n = Math.max(0, Math.floor(given[id]));
    else if (!info) n = ROOT_COUNT;
    else if (seen.has(id)) n = 0;
    else {
      const parents = resolve(info.parent, new Set([...seen, id]));
      n = info.cardinality === "one" ? parents : parents * CHILDREN_PER_PARENT;
    }
    out[id] = n;
    return n;
  };
  for (const e of entities) resolve(e.id, new Set());
  return out;
}

/**
 * ER からサンプルデータを作る。
 * - ルートのエンティティから順に作り、入れ子の子は親に配る（件数が親の数以上なら、どの親にも 1 件以上）
 * - `ref` は 2 周目で、参照先のエンティティの実在するレコードから選ぶ
 * - 値は型・列挙値・範囲・書式（ipv4 / email など）とフィールド名から決める
 */
export function generateSampleData(
  entities: readonly Entity[],
  options: SeedOptions = {},
): SeedResult {
  const faker = new Faker({ locale: [ja, en, base] });
  faker.seed(options.seed ?? DEFAULT_SEED);
  faker.setDefaultRefDate(new Date(options.refDate ?? DEFAULT_REF_DATE));

  const byId = new Map(entities.map((e) => [e.id, e]));
  const nest = nestParents(entities);
  const counts = defaultCounts(entities, options.counts);
  const warnings: string[] = [];
  const made: Record<string, number> = {};
  const all = new Map<string, DataRecord[]>(); // エンティティ id → 作ったレコード（ref の候補）

  const order = nestOrder(entities, nest, warnings);
  const data: Project["data"] = {};
  const seq = new Map<string, number>();
  const newRecord = (e: Entity): DataRecord => {
    const n = (seq.get(e.id) ?? 0) + 1;
    seq.set(e.id, n);
    const r: DataRecord = {};
    for (const f of e.fields) {
      if (f.id === e.primaryKey) r[f.id] = `${kebab(e.id)}-${String(n).padStart(3, "0")}`;
      else if (f.type === "children") r[f.id] = (f.cardinality ?? "many") === "many" ? [] : null;
      else if (f.type === "ref") r[f.id] = null;
      else r[f.id] = fieldValue(faker, e, f, n);
    }
    let list = all.get(e.id);
    if (!list) all.set(e.id, (list = []));
    list.push(r);
    made[e.id] = (made[e.id] ?? 0) + 1;
    return r;
  };

  for (const e of order) {
    const info = nest.get(e.id);
    const total = counts[e.id] ?? 0;
    if (!info) {
      data[e.id] = Array.from({ length: total }, () => newRecord(e));
      continue;
    }
    const parents = all.get(info.parent) ?? [];
    if (parents.length === 0) {
      if (total > 0) warnings.push(`${e.id}: 親の ${info.parent} が 0 件なので作れません`);
      continue;
    }
    const perParent = distribute(faker, total, parents.length, info.cardinality === "one");
    parents.forEach((p, i) => {
      const k = perParent[i] ?? 0;
      if (info.cardinality === "one") p[info.field] = k > 0 ? newRecord(e) : null;
      else p[info.field] = Array.from({ length: k }, () => newRecord(e));
    });
    if (info.cardinality === "one" && total > parents.length) {
      warnings.push(`${e.id}: 親 1 件につき 1 件までなので ${parents.length} 件にしました`);
    }
  }

  // ref は全部作ってから選ぶ（参照先が後で作られても指せるように）
  for (const e of order) {
    for (const f of e.fields) {
      if (f.type !== "ref" || !f.entity) continue;
      const target = byId.get(f.entity);
      const candidates = target ? (all.get(target.id) ?? []) : [];
      if (candidates.length === 0) {
        if (f.required && (all.get(e.id)?.length ?? 0) > 0)
          warnings.push(`${e.id}.${f.id}: 参照先の ${f.entity} が 0 件なので null にしました`);
        continue;
      }
      for (const r of all.get(e.id) ?? []) {
        const picked = faker.helpers.arrayElement(candidates);
        r[f.id] = target ? (picked[target.primaryKey] ?? null) : null;
      }
    }
  }

  return { data, counts: Object.fromEntries(order.map((e) => [e.id, made[e.id] ?? 0])), warnings };
}

/** 親 → 子の順に並べる。循環している入れ子は飛ばす。 */
function nestOrder(
  entities: readonly Entity[],
  nest: ReturnType<typeof nestParents>,
  warnings: string[],
): Entity[] {
  const out: Entity[] = [];
  const done = new Set<string>();
  const byId = new Map(entities.map((e) => [e.id, e]));
  const visit = (e: Entity, path: string[]) => {
    if (done.has(e.id)) return;
    if (path.includes(e.id)) {
      warnings.push(`${e.id}: 入れ子が循環しているので作りません`);
      done.add(e.id);
      return;
    }
    const info = nest.get(e.id);
    const parent = info ? byId.get(info.parent) : undefined;
    if (parent) visit(parent, [...path, e.id]);
    if (done.has(e.id)) return;
    done.add(e.id);
    out.push(e);
  };
  for (const e of entities) visit(e, []);
  return out;
}

/**
 * total 件を parents 個の親に配る。total が親の数以上なら、どの親にも 1 件以上。
 * `one` のときは各親 0 か 1。
 */
function distribute(faker: Faker, total: number, parents: number, one: boolean): number[] {
  const out = new Array<number>(parents).fill(0);
  if (one) {
    const picked = total >= parents ? out.map((_, i) => i) : pickDistinct(faker, parents, total);
    for (const i of picked) out[i] = 1;
    return out;
  }
  let rest = total;
  if (total >= parents) {
    out.fill(1);
    rest -= parents;
  } else {
    for (const i of pickDistinct(faker, parents, total)) out[i] = 1;
    rest = 0;
  }
  for (let k = 0; k < rest; k++) out[faker.number.int({ min: 0, max: parents - 1 })]! += 1;
  return out;
}

function pickDistinct(faker: Faker, n: number, k: number): number[] {
  return faker.helpers
    .shuffle(Array.from({ length: n }, (_, i) => i))
    .slice(0, k)
    .sort((a, b) => a - b);
}

function kebab(id: string): string {
  return id.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();
}

// ---- 値 ----

const INTEGER_HINT =
  /count|num|qty|quantity|sec|interval|port|age|year|days|times|retry|size|order|index|rank|level|priority/i;
const PERSON_ENTITY = /user|person|member|customer|employee|staff|owner|account|contact/i;

/** フィールドの値を、型・書式・範囲とフィールド名の手がかりから作る。 */
export function fieldValue(faker: Faker, entity: Entity, field: Field, n: number): JsonValue {
  const hint = `${field.id} ${field.name ?? ""}`;
  switch (field.type) {
    case "id":
    case "ref":
    case "children":
      return null;
    case "boolean":
      return faker.datatype.boolean();
    case "enum":
      return field.values?.length ? faker.helpers.arrayElement(field.values) : null;
    case "number": {
      const min = field.min ?? 0;
      const max = field.max ?? (field.min !== undefined ? field.min + 100 : 100);
      const integer = INTEGER_HINT.test(field.id) || (Number.isInteger(min) && max - min > 1000);
      return integer
        ? faker.number.int({ min: Math.ceil(min), max: Math.floor(max) })
        : faker.number.float({ min, max, fractionDigits: 1 });
    }
    case "date": {
      const d = faker.date.recent({ days: 30 });
      d.setUTCSeconds(0, 0);
      return field.format === "date" ? d.toISOString().slice(0, 10) : d.toISOString();
    }
    case "string":
      return stringValue(faker, entity, field, hint, n);
  }
}

function stringValue(faker: Faker, entity: Entity, field: Field, hint: string, n: number): string {
  const format =
    field.format ??
    (/e-?mail|メール/i.test(hint)
      ? "email"
      : /url|link|website|サイト/i.test(hint)
        ? "url"
        : /phone|tel|電話/i.test(hint)
          ? "phone"
          : /(^|[^a-z])ip|ipAddress|address.*ip|IP/.test(hint) && !/zip/i.test(hint)
            ? "ipv4"
            : undefined);
  switch (format) {
    case "email":
      return faker.internet.email();
    case "url":
      return faker.internet.url();
    case "phone":
      return faker.phone.number();
    case "ipv4":
      return `192.168.${faker.number.int({ min: 0, max: 255 })}.${faker.number.int({ min: 1, max: 254 })}`;
    case "multiline":
      return faker.lorem.paragraph();
    default:
      break;
  }
  if (/company|organization|vendor|maker|会社|メーカー/i.test(hint)) return faker.company.name();
  if (/address|住所/i.test(hint))
    return `${faker.location.city()}${faker.location.streetAddress()}`;
  if (/city|市/i.test(hint)) return faker.location.city();
  if (/^(name|fullName|displayName)$|氏名|名前/i.test(field.id) || /氏名/.test(hint)) {
    return PERSON_ENTITY.test(entity.id) ? faker.person.fullName() : `${entity.name} ${n}`;
  }
  if (/name|title|label|名|タイトル/i.test(hint)) return `${entity.name} ${n}`;
  if (/model|code|serial|sku|型番|品番/i.test(hint)) {
    return `${faker.string.alpha({ length: 2, casing: "upper" })}-${faker.number.int({ min: 100, max: 9999 })}`;
  }
  if (/version|firmware|バージョン/i.test(hint)) {
    return `${faker.number.int({ min: 0, max: 9 })}.${faker.number.int({ min: 0, max: 9 })}.${faker.number.int({ min: 0, max: 9 })}`;
  }
  if (/message|description|comment|note|memo|text|body|summary|内容|説明|メモ/i.test(hint)) {
    return faker.lorem.sentence();
  }
  return faker.lorem.words(2);
}
