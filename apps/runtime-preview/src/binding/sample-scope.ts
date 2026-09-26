import {
  createScope,
  defaultValue,
  evaluateTemplate,
  modelForCollection,
  parseDataModel,
  parseTypeExpression,
  type BindingSite,
  type TypeDecl,
} from "@ui-editor/runtime";
import type { Node, ParamDef, Project } from "@ui-editor/schema";

/** `state` の初期値。 */
export function initialState(project: Project): Record<string, unknown> {
  return Object.fromEntries(Object.entries(project.state ?? {}).map(([k, d]) => [k, d.initial]));
}

/**
 * 式を試すためのスコープ（`data` / `state` 以外）を、サンプルデータから作る。
 * - params / props: 定義の型からサンプルデータの最初のレコードなどを当てる（`deviceId` → 最初の機器の id）
 * - ループ変数: `repeat.each` を評価した最初の要素、`index` は 0
 * - `row`: 表の `rows` の最初の要素
 */
export function sampleLocals(
  project: Project,
  site: BindingSite | undefined,
): Record<string, unknown> {
  const decls = parseDataModel(project.dataModel.source).declarations;
  const data = project.sampleData;
  const locals: Record<string, unknown> = {};
  if (!site) {
    locals.params = sampleParams(project.screens[0]?.params, decls, data);
    return locals;
  }

  const owner =
    site.owner.kind === "screen"
      ? project.screens.find((s) => s.id === site.owner.id)
      : site.owner.kind === "dialog"
        ? project.dialogs?.find((d) => d.id === site.owner.id)
        : project.components?.find((c) => c.id === site.owner.id);
  if (!owner) return locals;
  if (site.names.includes("params") && "params" in owner)
    locals.params = sampleParams(owner.params, decls, data);
  if (site.names.includes("props") && "props" in owner)
    locals.props = sampleParams(owner.props, decls, data);

  const scope = () => createScope({ data, state: initialState(project), locals });
  let firstRow: unknown;
  for (const node of site.node ? (pathTo(owner.root, site.node) ?? []) : []) {
    if (node.repeat) {
      const each = evaluateTemplate(node.repeat.each, scope()).value;
      locals[node.repeat.as] = Array.isArray(each) ? each[0] : undefined;
      locals.index = 0;
    }
    if (node.id === site.node && node.type === "Table") {
      const rows = evaluateTemplate(String(node.props?.rows ?? ""), scope()).value;
      firstRow = Array.isArray(rows) ? rows[0] : undefined;
    }
  }
  if (site.names.includes("row")) locals.row = firstRow;
  // Table の rowClick は event.row、入力部品の change は event.value
  if (site.names.includes("event"))
    locals.event = site.location.includes("rowClick") ? { row: firstRow } : { value: "" };
  return locals;
}

function firstRecordOf(data: Project["sampleData"], collection: string): unknown {
  return data[collection]?.[0];
}

function sampleParams(
  defs: Record<string, ParamDef> | undefined,
  decls: TypeDecl[],
  data: Project["sampleData"],
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(defs ?? {}).map(([name, def]) => [name, sampleParam(name, def, decls, data)]),
  );
}

function sampleParam(
  name: string,
  def: ParamDef,
  decls: TypeDecl[],
  data: Project["sampleData"],
): unknown {
  if (def.default !== undefined) return def.default;
  const collectionOf = (model: string) =>
    Object.keys(data).find((c) => modelForCollection(c, decls)?.name === model);

  // `deviceId` → Device のコレクションの最初の id
  const idOf = /^(.+)Id$/.exec(name)?.[1];
  if (idOf && def.type === "string") {
    const model = decls.find((d) => d.name.toLowerCase() === idOf.toLowerCase());
    const record = model && firstRecordOf(data, collectionOf(model.name) ?? "");
    if (record && typeof record === "object" && "id" in record) return record.id;
  }
  const { type } = parseTypeExpression(def.type);
  if (type.kind === "ref") {
    const collection = collectionOf(type.name);
    if (collection) return firstRecordOf(data, collection);
  }
  return defaultValue(type, decls);
}

/** ルートから id のノードまでの経路。 */
function pathTo(root: Node, id: string): Node[] | undefined {
  if (root.id === id) return [root];
  for (const child of root.children ?? []) {
    const path = pathTo(child, id);
    if (path) return [root, ...path];
  }
  return undefined;
}
