import type { Entity, Field, Project } from "./schema.js";

/** ER（エンティティ・フィールド）を引くための補助関数。 */

export function entityMap(project: Pick<Project, "entities">): Map<string, Entity> {
  return new Map(project.entities.map((e) => [e.id, e]));
}

export function findField(entity: Entity, fieldId: string): Field | undefined {
  return entity.fields.find((f) => f.id === fieldId);
}

/** 子のエンティティが、どの親のどのフィールドに入れ子になっているか。 */
export interface NestInfo {
  parent: string;
  field: string;
  cardinality: "many" | "one";
}

/**
 * 子のエンティティ id → 入れ子の親。`children` で 2 回以上指されている場合は最初のものを使う
 * （検証でエラーにする）。
 */
export function nestParents(entities: readonly Entity[]): Map<string, NestInfo> {
  const out = new Map<string, NestInfo>();
  for (const e of entities) {
    for (const f of e.fields) {
      if (f.type === "children" && f.entity && !out.has(f.entity)) {
        out.set(f.entity, { parent: e.id, field: f.id, cardinality: f.cardinality ?? "many" });
      }
    }
  }
  return out;
}

/** 入れ子になっていない（`data` の直下に置く）エンティティ。 */
export function rootEntities(entities: readonly Entity[]): Entity[] {
  const nested = nestParents(entities);
  return entities.filter((e) => !nested.has(e.id));
}

/** 親から子へたどる `children` フィールド。 */
export function childFields(entity: Entity): Field[] {
  return entity.fields.filter((f) => f.type === "children" && f.entity !== undefined);
}

/** 値を持つ（`children` 以外の）フィールド。 */
export function valueFields(entity: Entity): Field[] {
  return entity.fields.filter((f) => f.type !== "children");
}
