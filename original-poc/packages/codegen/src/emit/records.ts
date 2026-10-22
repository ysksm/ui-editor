import { nestParents, type Entity, type Project } from "@ui-editor/poc-model";

/**
 * 生成アプリの `src/store/records.ts`: エンティティごとの型付きのデータの変更。
 * データの取得元を API に替えるときの境目（architecture.md 4.12）。
 */
export function emitRecords(project: Project): string {
  const nest = nestParents(project.entities);
  const entities = new Map(project.entities.map((e) => [e.id, e]));
  const nameOf = (id: string) => entities.get(id)?.name ?? id;
  const sections = project.entities.map((e) => {
    const n = nest.get(e.id);
    const head = n ? `${e.name}（${e.id}。${nameOf(n.parent)}の入れ子）` : `${e.name}（${e.id}）`;
    const create = n
      ? `/** ${e.name}を作る（親の${nameOf(n.parent)}の主キーを渡す）。主キーを省くと採番する。 */
export function create${e.id}(parentId: string, values: Values<"${e.id}">) {
  return createRecord("${e.id}", values, parentId);
}`
      : `/** ${e.name}を作る。主キーを省くと採番する。 */
export function create${e.id}(values: Values<"${e.id}">) {
  return createRecord("${e.id}", values);
}`;
    return `// ---- ${head} ----

${create}

/** 条件（項目 = 値。すべて合うもの）に合う${e.name}を更新する。 */
export function update${e.id}(match: Values<"${e.id}">, set: Values<"${e.id}">) {
  return updateRecords("${e.id}", match, set);
}

/** 条件に合う${e.name}を削除する。${deleteNotes(project, e)} */
export function delete${e.id}(match: Values<"${e.id}">) {
  return deleteRecords("${e.id}", match);
}`;
  });
  return `import type { Values } from "../model/types";
import { createRecord, deleteRecords, updateRecords } from "./store";

/**
 * エンティティごとのデータの変更。失敗するとお知らせを出し、\`{ ok: false, error, fieldErrors }\` を返す。
 * データの取得元を API に替えるときは、ここと store.ts の「データの変更」を書き換える。
 */

${sections.join("\n\n")}
`;
}

/** 削除で一緒に変わるもの（入れ子の子・参照の onDelete）の説明。 */
function deleteNotes(project: Project, entity: Entity): string {
  const names = new Map(project.entities.map((e) => [e.id, e.name]));
  const notes: string[] = [];
  const children = entity.fields.filter((f) => f.type === "children" && f.entity);
  if (children.length > 0)
    notes.push(
      `入れ子の${children.map((f) => names.get(f.entity!) ?? f.entity).join("・")}も消える。`,
    );
  for (const e of project.entities) {
    for (const f of e.fields) {
      if (f.type !== "ref" || f.entity !== entity.id) continue;
      const where = `${names.get(e.id) ?? e.id}の${f.name ?? f.id}`;
      const onDelete = f.onDelete ?? "restrict";
      if (onDelete === "cascade")
        notes.push(`${where}で参照している${names.get(e.id) ?? e.id}も消える。`);
      else if (onDelete === "setNull" && !f.required) notes.push(`${where}は null になる。`);
      else notes.push(`${where}から参照されていれば削除できない。`);
    }
  }
  return notes.length > 0 ? notes.join("") : "ほかのデータは変わらない。";
}
