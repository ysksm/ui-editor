import { hasBinding, type Component, type JsonValue, type Node } from "@ui-editor/schema";
import { actionStatements, arrowFunction, handlerName, type ActionContext } from "./actions.js";
import { templateExpr, templateParts, type Scope } from "./binding.js";
import { styleEntries } from "./css.js";
import type { CssModule } from "./css-module.js";
import type { Imports } from "./imports.js";
import { valueExpr } from "./values.js";

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
  /** エラーメッセージ用の持ち主の名前。例: `screens.dashboard` */
  owner: string;
  actions: ActionContext;
  /** コンポーネントのルート: インスタンスに付いたイベント（props で受け取る）を渡す先。 */
  root?: { node: Node; forwardEvents: readonly string[] };
}

/**
 * ノードを JSX の子にする。要素（`<div>...</div>`）か、式のコンテナ（`{...}`）を返す。
 * 描画しないノードは undefined。
 */
export function emitNode(node: Node, ctx: TreeContext, scope: Scope): string | undefined {
  if (node.visible === false) return undefined;
  const where = (field: string) => `${ctx.owner} のノード "${node.id}" の ${field}`;

  if (node.repeat) {
    const { each, as, key } = node.repeat;
    const list = templateExpr(each, scope, where("repeat.each"));
    const inner = scope.child([as, "index"]);
    // key が無ければ添字を使う
    const keyExpr =
      key !== undefined
        ? templateExpr(key, inner, where("repeat.key"))
        : (inner.resolve("index"), "index");
    const body = conditional(node, inner, where, element(node, ctx, inner, `key={${keyExpr}}`));
    const params = inner.used.has("index") ? `(${as}, index)` : `(${as})`;
    return `{${list}.map(${params} => (${body}))}`;
  }
  const el = element(node, ctx, scope);
  return typeof node.visible === "string" ? `{${conditional(node, scope, where, el)}}` : el;
}

/** return に置ける形にする。式のコンテナならフラグメントで囲む。 */
export function rootJsx(child: string | undefined): string {
  if (child === undefined) return "null";
  return child.startsWith("{") ? `<>${child}</>` : child;
}

/** visible が式なら `式 && 要素` にする。 */
function conditional(node: Node, scope: Scope, where: (f: string) => string, el: string): string {
  if (typeof node.visible !== "string") return el;
  return `${templateExpr(node.visible, scope, where("visible"))} && ${el}`;
}

function element(node: Node, ctx: TreeContext, scope: Scope, key?: string): string {
  const where = (field: string) => `${ctx.owner} のノード "${node.id}" の ${field}`;

  // 属性の並び: key → props → className / style
  const styleAttrs: string[] = [];
  const entries = styleEntries(node.style);
  const fixed = entries.filter(([, v]) => !isBinding(v));
  const bound = entries.filter(([, v]) => isBinding(v));
  if (fixed.length > 0) styleAttrs.push(`className={styles.${ctx.css.add(node.id, fixed)}}`);
  if (bound.length > 0) {
    // バインディングを含む style だけ style 属性にする
    const fields = bound.map(
      ([k, v]) => `${k}: ${templateExpr(String(v), scope, where(`style.${k}`))}`,
    );
    styleAttrs.push(`style={{ ${fields.join(", ")} }}`);
  }
  const eventAttrs = events(node, ctx, scope, where);
  const attrs = (props: [string, JsonValue][], ...extra: string[]) => [
    ...(key ? [key] : []),
    ...props.map(([name, value]) => attr(name, value, scope, where(`props.${name}`))),
    ...extra,
    ...styleAttrs,
    ...eventAttrs,
  ];
  const props = Object.entries(node.props ?? {});
  const except = (...names: string[]) => props.filter(([k]) => !names.includes(k));
  const children = (node.children ?? [])
    .map((child) => emitNode(child, ctx, scope))
    .filter((c): c is string => c !== undefined);

  const component = ctx.components.get(node.type);
  if (component) {
    ctx.imports.value(`${ctx.srcDir}/components/${component.id}`, component.id);
    // コンポーネントの props は定義の順に並べる
    const order = Object.keys(component.props ?? {});
    const sorted = [...props].sort(([a], [b]) => order.indexOf(a) - order.indexOf(b));
    return tag(component.id, attrs(sorted), []);
  }

  const p = node.props ?? {};
  switch (node.type) {
    case "Box":
      return tag("div", attrs(props), children);
    case "Text":
      return tag(
        useUi("Text", ctx),
        attrs(except("text")),
        textChildren(p.text, scope, where("props.text")),
      );
    case "Button":
      return tag(
        useUi("Button", ctx),
        attrs(except("label")),
        textChildren(p.label, scope, where("props.label")),
      );
    case "Table":
      return tag(
        useUi("Table", ctx),
        attrs(
          [["rows", p.rows ?? []], ...except("rows", "columns")],
          `columns={${tableColumns(p.columns, scope, where("props.columns"))}}`,
        ),
        [],
      );
    default: {
      const ui = UI_COMPONENTS[node.type];
      if (!ui) throw new Error(`${ctx.owner}: type "${node.type}" の生成方法がありません`);
      return tag(useUi(ui, ctx), attrs(props), children);
    }
  }
}

/**
 * イベント → `onXxx={ハンドラ}` の属性。
 * コンポーネントのルートなら、インスタンスから受け取ったハンドラ（props.onXxx）も呼ぶ。
 */
function events(
  node: Node,
  ctx: TreeContext,
  scope: Scope,
  where: (field: string) => string,
): string[] {
  const forward = ctx.root?.node === node ? ctx.root.forwardEvents : [];
  const names = [...new Set([...Object.keys(node.events ?? {}), ...forward])];
  return names.map((name) => {
    const handler = handlerName(name);
    const eventScope = scope.child(["event"]);
    const statements = actionStatements(
      node.events?.[name] ?? [],
      eventScope,
      ctx.actions,
      where(`events.${name}`),
    );
    if (forward.includes(name)) {
      scope.resolve("props");
      if (statements.length === 0) return `${handler}={props.${handler}}`;
      statements.push(`props.${handler}?.();`);
    }
    const params = eventScope.used.has("event") ? "event" : "";
    return `${handler}={${arrowFunction(statements, params)}}`;
  });
}

function useUi(name: string, ctx: TreeContext): string {
  ctx.ui.add(name);
  ctx.imports.value(`${ctx.srcDir}/ui/${name}`, name);
  return name;
}

function tag(name: string, attrs: string[], children: string[]): string {
  const open = [name, ...attrs].join(" ");
  if (children.length === 0) return `<${open} />`;
  return `<${open}>\n${children.join("\n")}\n</${name}>`;
}

/** JSX の属性 1 つ。固定の文字列は `name="..."`、それ以外は `name={式}`。 */
function attr(name: string, value: JsonValue, scope: Scope, where: string): string {
  if (value === true) return name;
  if (typeof value === "string" && !hasBinding(value) && !/["\\\n]/.test(value)) {
    return `${name}="${value}"`;
  }
  return `${name}={${valueExpr(value, scope, where)}}`;
}

/** Text の text / Button の label を JSX の子にする。`{{ }}` の部分は `{式}`。 */
function textChildren(value: JsonValue | undefined, scope: Scope, where: string): string[] {
  if (value === undefined || value === null) return [];
  const parts = templateParts(String(value), scope, where);
  const jsx = parts
    .map((p) => {
      if ("expr" in p) return `{${p.expr}}`;
      // 前後の空白は JSX でもそのまま残る（改行を含む場合と空白だけの場合は残らないので文字列にする）
      return /[{}<>\n]/.test(p.text) || p.text.trim() === ""
        ? `{${JSON.stringify(p.text)}}`
        : p.text;
    })
    .join("");
  return jsx === "" ? [] : [jsx];
}

/** Table の columns。value は行（`row`）を受け取る関数にする。 */
function tableColumns(columns: JsonValue | undefined, scope: Scope, where: string): string {
  if (!Array.isArray(columns)) return "[]";
  const items = columns.map((column, i) => {
    if (column === null || typeof column !== "object" || Array.isArray(column)) {
      throw new Error(`${where}: { header, value } の配列で指定してください`);
    }
    const { header, value } = column as Record<string, JsonValue>;
    const rowScope = scope.child(["row"]);
    const valueCode = valueExpr(value ?? "", rowScope, `${where}[${i}].value`);
    const param = rowScope.used.has("row") ? "row" : "";
    return `{ header: ${valueExpr(header ?? "", scope, `${where}[${i}].header`)}, value: (${param}) => ${valueCode} }`;
  });
  return `[${items.join(", ")}]`;
}

function isBinding(value: string | number): boolean {
  return typeof value === "string" && hasBinding(value);
}
