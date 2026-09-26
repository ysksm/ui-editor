import { hasBinding, type Component, type JsonValue, type Node } from "@ui-editor/schema";
import { styleEntries } from "./css.js";
import type { CssModule } from "./css-module.js";
import type { Imports } from "./imports.js";

/** 組み込みの type → 生成アプリの src/ui/ の部品名。Box は div にする。 */
const UI_COMPONENTS: Record<string, string> = {
  Text: "Text",
  Button: "Button",
  TextInput: "TextInput",
  NumberInput: "NumberInput",
  Checkbox: "Checkbox",
  Table: "Table",
};

/** ノードツリー 1 つ（画面・コンポーネント・ダイアログ）を JSX にするときの状態。 */
export interface TreeContext {
  components: ReadonlyMap<string, Component>;
  imports: Imports;
  css: CssModule;
  /** 生成するファイルから src/ への相対パス。例: `..` */
  srcDir: string;
  /** 使った src/ui/ のファイル名（拡張子なし）。プロジェクト全体で共有する。 */
  ui: Set<string>;
}

/** ノードを JSX の式にする。描画しないノードは undefined。 */
export function emitNode(node: Node, ctx: TreeContext): string | undefined {
  if (node.visible === false) return undefined;

  const attrs: string[] = [];
  const entries = styleEntries(node.style).filter(([, v]) => !isBinding(v));
  if (entries.length > 0) attrs.push(`className={styles.${ctx.css.add(node.id, entries)}}`);

  const children = (node.children ?? [])
    .map((child) => emitNode(child, ctx))
    .filter((c): c is string => c !== undefined);

  const component = ctx.components.get(node.type);
  if (component) {
    ctx.imports.value(`${ctx.srcDir}/components/${component.id}`, component.id);
    // コンポーネントの props は定義の順に並べる
    const order = Object.keys(component.props ?? {});
    const props = Object.entries(node.props ?? {}).sort(
      ([a], [b]) => order.indexOf(a) - order.indexOf(b),
    );
    return element(component.id, [...propAttrs(Object.fromEntries(props), ctx), ...attrs], []);
  }

  switch (node.type) {
    case "Box":
      return element("div", attrs, children);
    case "Text": {
      const { text, ...rest } = node.props ?? {};
      return element(useUi("Text", ctx), [...propAttrs(rest, ctx), ...attrs], textChildren(text));
    }
    case "Button": {
      const { label, ...rest } = node.props ?? {};
      return element(
        useUi("Button", ctx),
        [...propAttrs(rest, ctx), ...attrs],
        textChildren(label),
      );
    }
    case "Table": {
      const { rows, columns, ...rest } = node.props ?? {};
      // 行はまだバインディングを変換しないので空にしておく（テンプレートはコメントで残す）
      const rowsAttr =
        typeof rows === "string" && hasBinding(rows)
          ? `rows={[] /* ${rows.replace(/\*\//g, "* /")} */}`
          : attr("rows", rows ?? [], ctx);
      return element(
        useUi("Table", ctx),
        [rowsAttr, ...propAttrs(rest, ctx), `columns={${tableColumns(columns, ctx)}}`, ...attrs],
        [],
      );
    }
    default: {
      const ui = UI_COMPONENTS[node.type];
      if (!ui) throw new Error(`type "${node.type}" の生成方法がありません`);
      return element(useUi(ui, ctx), [...propAttrs(node.props, ctx), ...attrs], children);
    }
  }
}

function useUi(name: string, ctx: TreeContext): string {
  ctx.ui.add(name);
  ctx.imports.value(`${ctx.srcDir}/ui/${name}`, name);
  return name;
}

function element(tag: string, attrs: string[], children: string[]): string {
  const open = [tag, ...attrs].join(" ");
  if (children.length === 0) return `<${open} />`;
  return `<${open}>\n${children.join("\n")}\n</${tag}>`;
}

function propAttrs(props: Record<string, JsonValue> | undefined, ctx: TreeContext): string[] {
  return Object.entries(props ?? {}).map(([name, value]) => attr(name, value, ctx));
}

/** JSX の属性 1 つ。固定の文字列は `name="..."`、それ以外は `name={式}`。 */
function attr(name: string, value: JsonValue, ctx: TreeContext): string {
  if (value === true) return name;
  if (typeof value === "string" && !hasBinding(value) && !/["\\\n]/.test(value)) {
    return `${name}="${value}"`;
  }
  return `${name}={${valueExpr(value, ctx)}}`;
}

/** JSON の値を TS の式にする。 */
function valueExpr(value: JsonValue, ctx: TreeContext): string {
  if (typeof value === "string")
    return hasBinding(value) ? binding(value, ctx) : JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((v) => valueExpr(v, ctx)).join(", ")}]`;
  if (value !== null && typeof value === "object") {
    const fields = Object.entries(value).map(
      ([k, v]) => `${propertyKey(k)}: ${valueExpr(v as JsonValue, ctx)}`,
    );
    return `{ ${fields.join(", ")} }`;
  }
  return JSON.stringify(value);
}

/**
 * バインディングを含む文字列を式にする。
 * まだ変換しないので、テンプレートのまま unbound() で仮置きする。
 */
function binding(template: string, ctx: TreeContext): string {
  useUi("unbound", ctx);
  return `unbound(${JSON.stringify(template)})`;
}

/** Text の text / Button の label を JSX の子にする。 */
function textChildren(value: JsonValue | undefined): string[] {
  if (value === undefined || value === null) return [];
  const text = String(value);
  if (/[{}<>]/.test(text) || text !== text.trim()) return [`{${JSON.stringify(text)}}`];
  return [text];
}

/** Table の columns。value は行（row）を受け取る関数にする。 */
function tableColumns(columns: JsonValue | undefined, ctx: TreeContext): string {
  if (!Array.isArray(columns)) return "[]";
  const items = columns.map((column) => {
    if (column === null || typeof column !== "object" || Array.isArray(column)) {
      throw new Error("Table の columns は { header, value } の配列で指定してください");
    }
    const { header, value } = column as Record<string, JsonValue>;
    return `{ header: ${valueExpr(header ?? "", ctx)}, value: () => ${valueExpr(value ?? "", ctx)} }`;
  });
  return `[${items.join(", ")}]`;
}

function propertyKey(key: string): string {
  return /^[A-Za-z_$][\w$]*$/.test(key) ? key : JSON.stringify(key);
}

function isBinding(value: string | number): boolean {
  return typeof value === "string" && hasBinding(value);
}
