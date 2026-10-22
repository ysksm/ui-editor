import { extractExpressions } from "./binding.js";
import { walkData } from "./data.js";
import type { IssuePath } from "./issues.js";
import type { JsonValue, Project } from "./schema.js";
import { containers, walkActions, walkNodes } from "./walk.js";

/**
 * ER の変更の影響（FR-ER-08）: エンティティ・属性を参照している場所を集める。
 * 削除や id の変更の前に示して確かめるために使う。式の中の参照は書き換えられないので、`expression: true` を付ける。
 */
export interface Reference {
  path: IssuePath;
  /** 人に見せる説明（例: 画面「機器一覧」の部品 table の rows: {{ data.Device }}）。 */
  message: string;
  /** 式の中の参照（id を変えても書き換わらない）。 */
  expression?: boolean;
}

export interface ReferenceTarget {
  entity: string;
  /** 属性まで指すとき。 */
  field?: string | undefined;
}

export function findReferences(project: Project, target: ReferenceTarget): Reference[] {
  const out: Reference[] = [];
  const { entity: E, field: F } = target;
  const entity = project.entities.find((e) => e.id === E);
  if (!entity) return out;
  const containerName = (kind: string, name: string) =>
    `${kind === "screen" ? "画面" : "ダイアログ"}「${name}」`;
  const exprRe = F
    ? new RegExp(`(?:\\b(?:record|row|draft|errors)\\??\\.${F}\\b|selection\\.${E}\\??\\.${F}\\b)`)
    : new RegExp(`\\b(?:data|selection)\\.${E}\\b`);

  /** JSON の値の中の式を調べる。 */
  const scan = (value: JsonValue | undefined, path: IssuePath, where: string) => {
    if (typeof value === "string") {
      for (const expr of extractExpressions(value)) {
        if (exprRe.test(expr))
          out.push({ path, message: `${where}: {{ ${expr} }}`, expression: true });
      }
    } else if (Array.isArray(value)) {
      value.forEach((v, i) => scan(v, [...path, i], where));
    } else if (value !== null && typeof value === "object") {
      for (const [k, v] of Object.entries(value)) scan(v, [...path, k], where);
    }
  };

  // ER
  project.entities.forEach((e, i) => {
    e.fields.forEach((f, j) => {
      if (!F && e.id !== E && f.entity === E)
        out.push({
          path: ["entities", i, "fields", j],
          message: `${e.name}.${f.id}（${f.type === "children" ? "入れ子" : "参照"}）`,
        });
    });
    if (F && e.id === E) {
      if (e.primaryKey === F)
        out.push({ path: ["entities", i, "primaryKey"], message: `${e.name}の主キー` });
      if (e.displayField === F)
        out.push({
          path: ["entities", i, "displayField"],
          message: `${e.name}の表示用フィールド`,
        });
    }
  });

  // 画面・ダイアログ・部品
  for (const ref of containers(project)) {
    const c = ref.container;
    const where = containerName(ref.kind, c.name);
    if (!F && c.entity === E)
      out.push({ path: [...ref.path, "entity"], message: `${where}の扱うエンティティ` });
    for (const [name, def] of Object.entries(c.params ?? {})) {
      if (!F && def.entity === E)
        out.push({ path: [...ref.path, "params", name], message: `${where}のパラメータ ${name}` });
    }
    if (!c.root) continue;
    walkNodes(c.root, [...ref.path, "root"], (node, path) => {
      const p = node.props ?? {};
      if (!F && node.type === "Table" && p.entity === E)
        out.push({ path: [...path, "props", "entity"], message: `${where}の表 ${node.id}` });
      if (
        typeof p.requires === "string" &&
        (F ? p.requires === `selection.${E}.${F}` : p.requires === `selection.${E}`)
      )
        out.push({
          path: [...path, "props", "requires"],
          message: `${where}のボタン ${node.id} の requires`,
        });
      scan(node.props, [...path, "props"], `${where}の部品 ${node.id}`);
      if (typeof node.visible === "string")
        scan(node.visible, [...path, "visible"], `${where}の部品 ${node.id}`);
      if (node.repeat)
        scan(node.repeat as JsonValue, [...path, "repeat"], `${where}の部品 ${node.id}`);
    });
  }

  // アクション
  walkActions(project, ({ action, path, container }) => {
    const where = `${containerName(container.kind, container.container.name)}のアクション ${action.type}`;
    if ("entity" in action && action.entity === E) {
      if (!F) out.push({ path: [...path, "entity"], message: where });
      else {
        const keys = [
          ...Object.keys(("values" in action && action.values) || {}),
          ...Object.keys(("match" in action && action.match) || {}),
          ...Object.keys(("set" in action && action.set) || {}),
        ];
        if (keys.includes(F)) out.push({ path, message: `${where} の ${F}` });
      }
    }
    if (F && action.type === "setDraft" && action.field === F && container.container.entity === E)
      out.push({ path: [...path, "field"], message: `${where} の ${F}` });
    // アクションの値の中の式
    const { type: _type, ...rest } = action;
    void _type;
    scan(rest as JsonValue, path, where);
  });

  // データ
  let records = 0;
  walkData(project, ({ entity: e, record }) => {
    if (e.id === E && (!F || record[F] !== undefined)) records++;
  });
  if (records > 0)
    out.push({
      path: ["data"],
      message: F ? `データ ${records} 件の ${F} の値` : `${entity.name}のデータ ${records} 件`,
    });
  return out;
}

/** 影響を確認の文にまとめる（多ければ先頭だけ）。 */
export function describeReferences(refs: readonly Reference[], limit = 8): string {
  if (refs.length === 0) return "";
  const lines = refs
    .slice(0, limit)
    .map((r) => `・${r.message}${r.expression ? "（式。書き換わりません）" : ""}`);
  if (refs.length > limit) lines.push(`ほか ${refs.length - limit} 件`);
  return lines.join("\n");
}
