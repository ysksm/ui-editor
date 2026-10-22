import { walkData } from "../data.js";
import { nestParents } from "../er.js";
import {
  ENTITY_ID_PATTERN,
  IDENTIFIER_PATTERN,
  type Entity,
  type Field,
  type FieldType,
  type Position,
  type Project,
} from "../schema.js";
import { containers, walkActions, walkNodes } from "../walk.js";
import { lowerFirst, numberedId, pluralize, uniqueId } from "./ids.js";

/**
 * ER の編集操作。どれも `(draft: Project, …) => …` で、immer の draft（または素のオブジェクト）を書き換える。
 * 前提を満たさない呼び出しは Error を投げる（エディタは先に `…Problem` で確かめる）。
 */

function entityOf(draft: Project, id: string): Entity {
  const e = draft.entities.find((x) => x.id === id);
  if (!e) throw new Error(`エンティティ "${id}" がありません`);
  return e;
}

function fieldOf(entity: Entity, id: string): Field {
  const f = entity.fields.find((x) => x.id === id);
  if (!f) throw new Error(`${entity.id} にフィールド "${id}" はありません`);
  return f;
}

/** あるエンティティのレコード（入れ子の中も）から、フィールドの値を消す。 */
function deleteFieldValues(draft: Project, entityId: string, fieldId: string): void {
  walkData(draft, ({ entity, record }) => {
    if (entity.id === entityId) delete record[fieldId];
  });
}

// ---- エンティティ ----

export function addEntity(
  draft: Project,
  init: { id?: string; name?: string; position?: Position } = {},
): string {
  const id =
    init.id ??
    numberedId(
      "Entity",
      draft.entities.map((e) => e.id),
    );
  const problem = entityIdProblem(draft, id);
  if (problem) throw new Error(problem);
  draft.entities.push({
    id,
    name: init.name ?? (init.id ? id : `エンティティ${id.replace(/^Entity/, "")}`),
    primaryKey: "id",
    fields: [{ id: "id", type: "id" }],
  });
  if (init.position) setEntityPosition(draft, id, init.position);
  return id;
}

/** エンティティ id として使えない理由（使えるなら undefined）。 */
export function entityIdProblem(
  project: Pick<Project, "entities">,
  id: string,
  self?: string,
): string | undefined {
  if (!ENTITY_ID_PATTERN.test(id)) return "英大文字で始まる英数字（PascalCase）にしてください";
  if (id !== self && project.entities.some((e) => e.id === id)) return `"${id}" は既にあります`;
  return undefined;
}

export function updateEntity(
  draft: Project,
  id: string,
  patch: { name?: string; displayField?: string | undefined },
): void {
  const e = entityOf(draft, id);
  if (patch.name !== undefined) e.name = patch.name;
  if ("displayField" in patch) {
    if (patch.displayField === undefined) delete e.displayField;
    else e.displayField = patch.displayField;
  }
}

/**
 * エンティティの id を変え、参照（フィールドの entity、data のキー、画面・パラメータ・表・ボタン・
 * アクションの entity、layout）も書き換える。式の中（`data.Device` など）は書き換えない。
 */
export function renameEntityId(draft: Project, oldId: string, newId: string): void {
  if (oldId === newId) return;
  const problem = entityIdProblem(draft, newId, oldId);
  if (problem) throw new Error(problem);
  entityOf(draft, oldId).id = newId;
  for (const e of draft.entities) {
    for (const f of e.fields) if (f.entity === oldId) f.entity = newId;
  }
  if (oldId in draft.data) {
    draft.data[newId] = draft.data[oldId]!;
    delete draft.data[oldId];
  }
  for (const { container } of containers(draft)) {
    if (container.entity === oldId) container.entity = newId;
    for (const def of Object.values(container.params ?? {})) {
      if (def.entity === oldId) def.entity = newId;
    }
    if (container.root) {
      walkNodes(container.root, [], (node) => {
        if (!node.props) return;
        if (node.type === "Table" && node.props.entity === oldId) node.props.entity = newId;
        if (node.props.requires === `selection.${oldId}`)
          node.props.requires = `selection.${newId}`;
      });
    }
  }
  walkActions(draft, ({ action }) => {
    if ("entity" in action && action.entity === oldId) action.entity = newId;
  });
  const er = draft.layout?.er;
  if (er && oldId in er) {
    er[newId] = er[oldId]!;
    delete er[oldId];
  }
}

/**
 * エンティティを消す。ほかのエンティティのそれを指すフィールド（ref / children）と、その値・入れ子のデータも消す。
 * 画面・アクションからの参照は残す（検証で指摘する。影響の表示はステップ 5）。
 */
export function deleteEntity(draft: Project, id: string): void {
  entityOf(draft, id);
  for (const e of draft.entities) {
    if (e.id === id) continue;
    for (const f of e.fields.filter((x) => x.entity === id)) deleteFieldValues(draft, e.id, f.id);
    e.fields = e.fields.filter((f) => f.entity !== id);
  }
  draft.entities = draft.entities.filter((e) => e.id !== id);
  delete draft.data[id];
  if (draft.layout?.er) delete draft.layout.er[id];
}

export function setEntityPosition(draft: Project, id: string, position: Position): void {
  draft.layout ??= {};
  draft.layout.er ??= {};
  draft.layout.er[id] = { x: Math.round(position.x), y: Math.round(position.y) };
}

/** ER 図の配置をまとめて置き換える（自動レイアウト）。 */
export function setErPositions(draft: Project, positions: Record<string, Position>): void {
  draft.layout ??= {};
  draft.layout.er = Object.fromEntries(
    Object.entries(positions).map(([id, p]) => [id, { x: Math.round(p.x), y: Math.round(p.y) }]),
  );
}

// ---- フィールド ----

/** フィールド id として使えない理由（使えるなら undefined）。 */
export function fieldIdProblem(entity: Entity, id: string, self?: string): string | undefined {
  if (!IDENTIFIER_PATTERN.test(id)) return "英字・数字・_ で、数字以外で始めてください";
  if (id !== self && entity.fields.some((f) => f.id === id)) return `"${id}" は既にあります`;
  return undefined;
}

export function addField(draft: Project, entityId: string, init: Partial<Field> = {}): string {
  const e = entityOf(draft, entityId);
  const id =
    init.id ??
    numberedId(
      "field",
      e.fields.map((f) => f.id),
    );
  const problem = fieldIdProblem(e, id);
  if (problem) throw new Error(problem);
  e.fields.push({ type: "string", ...init, id });
  return id;
}

/** 型ごとに意味のあるキー（ほかの型に変えたら消す）。 */
const TYPE_KEYS: Record<string, readonly FieldType[]> = {
  values: ["enum"],
  entity: ["ref", "children"],
  onDelete: ["ref"],
  cardinality: ["children"],
  min: ["number"],
  max: ["number"],
  required: ["id", "string", "number", "boolean", "date", "enum", "ref"],
  default: ["string", "number", "boolean", "date", "enum"],
};
const FORMATS_BY_TYPE: Record<string, readonly string[]> = {
  string: ["email", "url", "ipv4", "phone", "multiline"],
  date: ["date", "datetime"],
};

/**
 * フィールドを変える（id 以外）。型を変えたら、その型で使わないキーを消す。
 * children の有無や子のエンティティが変わったら、そのフィールドの入れ子のデータは消す。
 */
export function updateField(
  draft: Project,
  entityId: string,
  fieldId: string,
  patch: Partial<Omit<Field, "id">>,
): void {
  const e = entityOf(draft, entityId);
  const old = fieldOf(e, fieldId);
  const next: Field = { ...old, ...patch };
  for (const [k, v] of Object.entries(next)) if (v === undefined) delete next[k as keyof Field];
  if (next.type !== old.type) {
    for (const [key, types] of Object.entries(TYPE_KEYS)) {
      if (!types.includes(next.type)) delete next[key as keyof Field];
    }
    if (next.format && !(FORMATS_BY_TYPE[next.type] ?? []).includes(next.format))
      delete next.format;
  }
  const nestChanged =
    (old.type === "children") !== (next.type === "children") ||
    (old.type === "children" &&
      (old.entity !== next.entity || old.cardinality !== next.cardinality));
  if (nestChanged) deleteFieldValues(draft, entityId, fieldId);
  e.fields[e.fields.indexOf(old)] = next;
}

/**
 * フィールドの id を変え、主キー・表示用フィールド・データのキー・アクション（values / match / set、
 * フォームの setDraft）も書き換える。式の中（`row.name` など）は書き換えない。
 */
export function renameField(draft: Project, entityId: string, oldId: string, newId: string): void {
  if (oldId === newId) return;
  const e = entityOf(draft, entityId);
  const problem = fieldIdProblem(e, newId, oldId);
  if (problem) throw new Error(problem);
  fieldOf(e, oldId).id = newId;
  if (e.primaryKey === oldId) e.primaryKey = newId;
  if (e.displayField === oldId) e.displayField = newId;
  walkData(draft, ({ entity, record }) => {
    if (entity.id !== entityId || !(oldId in record)) return;
    record[newId] = record[oldId]!;
    delete record[oldId];
  });
  const renameKey = (obj: Record<string, unknown> | undefined) => {
    if (!obj || !(oldId in obj)) return;
    obj[newId] = obj[oldId];
    delete obj[oldId];
  };
  walkActions(draft, ({ action, container }) => {
    switch (action.type) {
      case "createRecord":
        if (action.entity === entityId) renameKey(action.values);
        break;
      case "updateRecord":
        if (action.entity === entityId) {
          renameKey(action.match);
          renameKey(action.set);
        }
        break;
      case "deleteRecord":
        if (action.entity === entityId) renameKey(action.match);
        break;
      case "setDraft":
        if (container.container.entity === entityId && action.field === oldId) action.field = newId;
        break;
      default:
        break;
    }
  });
}

/** フィールドを消し、データの値も消す（children なら入れ子のデータも）。主キーは消せない。 */
export function deleteField(draft: Project, entityId: string, fieldId: string): void {
  const e = entityOf(draft, entityId);
  fieldOf(e, fieldId);
  if (e.primaryKey === fieldId) throw new Error("主キーは消せません");
  deleteFieldValues(draft, entityId, fieldId);
  e.fields = e.fields.filter((f) => f.id !== fieldId);
  if (e.displayField === fieldId) delete e.displayField;
}

export function moveField(
  draft: Project,
  entityId: string,
  fieldId: string,
  toIndex: number,
): void {
  const e = entityOf(draft, entityId);
  const from = e.fields.indexOf(fieldOf(e, fieldId));
  const to = Math.max(0, Math.min(e.fields.length - 1, toIndex));
  if (from === to) return;
  const [f] = e.fields.splice(from, 1);
  e.fields.splice(to, 0, f!);
}

// ---- 関係 ----

/**
 * - `one-to-many` / `one-to-one`: `from` を親、`to` を子にして入れ子にする（親に children を足す）
 * - `many-to-one`: `from` から `to` を参照する（`from` に ref = 外部キーを足す）
 */
export type RelationKind = "one-to-many" | "one-to-one" | "many-to-one";

/** 関係を作れない理由（作れるなら undefined）。 */
export function relationProblem(
  project: Pick<Project, "entities">,
  from: string,
  to: string,
  kind: RelationKind,
): string | undefined {
  const ids = new Set(project.entities.map((e) => e.id));
  if (!ids.has(from)) return `エンティティ "${from}" がありません`;
  if (!ids.has(to)) return `エンティティ "${to}" がありません`;
  if (kind === "many-to-one") return undefined;
  if (from === to) return "自分自身は入れ子にできません";
  const parents = nestParents(project.entities);
  const parent = parents.get(to);
  if (parent)
    return `"${to}" は既に ${parent.parent} の入れ子です（入れ子の親は 1 つだけ。参照を使ってください）`;
  for (let cur = parents.get(from); cur; cur = parents.get(cur.parent)) {
    if (cur.parent === to) return `"${from}" は "${to}" の入れ子の中にあるので、入れ子が循環します`;
  }
  return undefined;
}

/** 入れ子にすると消える、子の（data の直下の）レコードの件数。 */
export function relationDataLoss(
  project: Pick<Project, "data">,
  to: string,
  kind: RelationKind,
): number {
  return kind === "many-to-one" ? 0 : (project.data[to]?.length ?? 0);
}

/** 関係を作り、足したフィールドを返す。 */
export function addRelation(
  draft: Project,
  from: string,
  to: string,
  kind: RelationKind,
): { entity: string; field: string } {
  const problem = relationProblem(draft, from, to, kind);
  if (problem) throw new Error(problem);
  const source = entityOf(draft, from);
  const target = entityOf(draft, to);
  const taken = source.fields.map((f) => f.id);
  if (kind === "many-to-one") {
    const id = uniqueId(`${lowerFirst(to)}Id`, taken);
    source.fields.push({ id, name: target.name, type: "ref", entity: to, onDelete: "restrict" });
    return { entity: from, field: id };
  }
  const id = uniqueId(kind === "one-to-many" ? pluralize(lowerFirst(to)) : lowerFirst(to), taken);
  source.fields.push({
    id,
    name: target.name,
    type: "children",
    entity: to,
    ...(kind === "one-to-one" ? { cardinality: "one" as const } : {}),
  });
  // 子は親の中に入るので、data の直下にあったレコードは置き場所が無くなる
  delete draft.data[to];
  return { entity: from, field: id };
}
