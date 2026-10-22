import { entityMap } from "./er.js";
import type { IssuePath } from "./issues.js";
import type { DataRecord, Entity, Field, JsonValue, Project } from "./schema.js";

/** 入れ子のデータをたどる・値を調べるための補助関数（検証と poc-datastore で使う）。 */

export function isRecord(value: unknown): value is DataRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** 必須の判定で「無い」とみなす値。 */
export function isBlank(value: unknown): boolean {
  return value === undefined || value === null || value === "";
}

export interface RecordVisit {
  entity: Entity;
  record: DataRecord;
  /** 例: `["data", "Device", 0, "alarms", 2]` */
  path: IssuePath;
  /** 入れ子の親（ルートのレコードなら undefined）。 */
  parent: { entity: Entity; record: DataRecord } | undefined;
}

/**
 * 入れ子のデータをエンティティ定義に沿って深さ優先でたどる（親 → 子、配列の順）。
 * 定義に無いエンティティや、形が合わない値（配列のはずがオブジェクトなど）は飛ばす。
 */
export function walkData(
  project: Pick<Project, "entities" | "data">,
  visit: (v: RecordVisit) => void,
): void {
  const entities = entityMap(project);
  const walk = (
    entity: Entity,
    record: DataRecord,
    path: IssuePath,
    parent: RecordVisit["parent"],
  ) => {
    visit({ entity, record, path, parent });
    for (const f of entity.fields) {
      if (f.type !== "children" || !f.entity) continue;
      const child = entities.get(f.entity);
      if (!child) continue;
      const value = record[f.id];
      const me = { entity, record };
      if (Array.isArray(value)) {
        value.forEach((v, i) => {
          if (isRecord(v)) walk(child, v, [...path, f.id, i], me);
        });
      } else if (isRecord(value)) {
        walk(child, value, [...path, f.id], me);
      }
    }
  };
  for (const [entityId, records] of Object.entries(project.data)) {
    const entity = entities.get(entityId);
    if (!entity) continue;
    records.forEach((r, i) => walk(entity, r, ["data", entityId, i], undefined));
  }
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?)?$/;

/**
 * フィールドの値の型を調べ、合わなければ理由を返す。
 * null / undefined は「値が無い」とみなして通す（必須の判定は呼び出し側）。
 * `children` と、`ref` の参照先が実在するかは調べない。
 */
export function checkFieldValue(field: Field, value: JsonValue | undefined): string | undefined {
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

const FORMATS: Partial<Record<NonNullable<Field["format"]>, RegExp>> = {
  email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  url: /^https?:\/\/\S+$/,
  ipv4: /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/,
  phone: /^[0-9+\-() ]{6,}$/,
  date: /^\d{4}-\d{2}-\d{2}$/,
};

/** 書式（email / ipv4 など）に合っているか。合わなければ理由を返す（検証では警告にする）。 */
export function checkFieldFormat(field: Field, value: JsonValue | undefined): string | undefined {
  if (typeof value !== "string" || value === "" || !field.format) return undefined;
  const re = FORMATS[field.format];
  return re && !re.test(value) ? `書式 ${field.format} に合っていません` : undefined;
}
