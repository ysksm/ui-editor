import { parse, type Node as EsNode } from "acorn";
import { checkTemplate, extractExpressions, wholeExpression } from "@ui-editor/schema";

/**
 * `{{ 式 }}` のバインディング → TS の式。
 * 式はそのまま生成コードに埋め込む（`data` / `state` / `props` などは生成コード側で同じ名前の変数にする）。
 * そのため、構文エラーや、どこにも無い名前を参照している式は生成時にエラーにする。
 */

/** バインディングを変換できなかった。where はプロジェクトファイル内の場所。 */
export class BindingError extends Error {
  override name = "BindingError";

  constructor(
    readonly where: string,
    readonly expression: string,
    reason: string,
  ) {
    super(`${where}: ${reason}\n  式: ${expression}`);
  }
}

/** 式の中でどこからでも使える名前（JS の組み込み）。 */
export const GLOBAL_NAMES: ReadonlySet<string> = new Set([
  "undefined",
  "NaN",
  "Infinity",
  "Math",
  "JSON",
  "Number",
  "String",
  "Boolean",
  "Array",
  "Object",
  "Date",
  "Intl",
  "structuredClone",
  "encodeURIComponent",
  "decodeURIComponent",
  "parseInt",
  "parseFloat",
  "isNaN",
  "isFinite",
]);

/**
 * 式から参照できる名前。子のスコープ（repeat の `as` など）を重ねていく。
 * 参照された名前は、その名前を持つスコープの used に記録する（生成コードで変数を宣言するかどうかに使う）。
 */
export class Scope {
  readonly used = new Set<string>();
  readonly #names: ReadonlySet<string>;

  constructor(
    names: Iterable<string>,
    readonly parent?: Scope,
  ) {
    this.#names = new Set(names);
  }

  child(names: Iterable<string>): Scope {
    return new Scope(names, this);
  }

  /** 名前を解決できれば true。見つけたスコープに使ったことを記録する。 */
  resolve(name: string): boolean {
    if (this.#names.has(name)) {
      this.used.add(name);
      return true;
    }
    return this.parent?.resolve(name) ?? GLOBAL_NAMES.has(name);
  }
}

/** 式を構文解析し、スコープに無い名前を参照していないか確かめる。 */
export function checkExpression(expression: string, scope: Scope, where: string): void {
  let ast: EsNode;
  try {
    // 括弧で囲んで 1 つの式として解析する（`a; b` のような文は構文エラーになる）
    const program = parse(`(${expression}\n)`, { ecmaVersion: "latest" });
    ast = program.body[0]!;
  } catch (e) {
    throw new BindingError(where, expression, `式の構文エラー（${(e as Error).message}）`);
  }
  const unknown = freeNames(ast, new Set()).find((name) => !scope.resolve(name));
  if (unknown !== undefined) {
    throw new BindingError(where, expression, `"${unknown}" はここでは参照できません`);
  }
}

/** テンプレートの部品。固定の文字列か式。 */
export type TemplatePart = { text: string } | { expr: string };

/** テンプレートを固定の文字列と式に分ける。式は検証済み。 */
export function templateParts(template: string, scope: Scope, where: string): TemplatePart[] {
  const problem = checkTemplate(template);
  if (problem) throw new BindingError(where, template, problem);
  const parts: TemplatePart[] = [];
  let rest = template;
  for (const expr of extractExpressions(template)) {
    const start = rest.indexOf("{{");
    const end = rest.indexOf("}}", start) + 2;
    if (start > 0) parts.push({ text: rest.slice(0, start) });
    checkExpression(expr, scope, where);
    parts.push({ expr });
    rest = rest.slice(end);
  }
  if (rest !== "") parts.push({ text: rest });
  return parts;
}

/**
 * テンプレートを 1 つの TS の式にする。
 * - 全体が 1 つの `{{ }}` なら式の値をそのまま使う（配列なども渡せる）
 * - それ以外はテンプレートリテラル
 * 優先順位で困らないよう、式は括弧で囲む（不要な括弧は Prettier が外す）。
 */
export function templateExpr(template: string, scope: Scope, where: string): string {
  const whole = wholeExpression(template);
  if (whole !== undefined) {
    checkExpression(whole, scope, where);
    return `(${whole})`;
  }
  const parts = templateParts(template, scope, where);
  if (parts.every((p) => "text" in p)) return JSON.stringify(template);
  const body = parts
    .map((p) => ("text" in p ? p.text.replace(/[`\\]|\$\{/g, (c) => `\\${c}`) : `\${${p.expr}}`))
    .join("");
  return `\`${body}\``;
}

// ---- 自由変数（式の外から持ち込んでいる名前）の収集 ----

type AnyNode = EsNode & Record<string, unknown>;

function isNode(value: unknown): value is AnyNode {
  return value !== null && typeof value === "object" && typeof (value as EsNode).type === "string";
}

/** 式の中で宣言されずに参照されている名前（出てきた順、重複なし）。 */
function freeNames(node: AnyNode | EsNode, bound: ReadonlySet<string>): string[] {
  const out: string[] = [];
  const visit = (n: unknown, b: ReadonlySet<string>) => {
    if (Array.isArray(n)) return n.forEach((c) => visit(c, b));
    if (!isNode(n)) return;
    switch (n.type) {
      case "Identifier": {
        const name = n.name as string;
        if (!b.has(name) && !out.includes(name)) out.push(name);
        return;
      }
      case "MemberExpression":
        visit(n.object, b);
        if (n.computed) visit(n.property, b);
        return;
      case "Property":
      case "PropertyDefinition":
        if (n.computed) visit(n.key, b);
        visit(n.value, b);
        return;
      case "ArrowFunctionExpression":
      case "FunctionExpression": {
        const inner = new Set(b);
        if (isNode(n.id)) inner.add(n.id.name as string);
        for (const p of n.params as AnyNode[]) patternNames(p, inner);
        declaredNames(n.body, inner);
        for (const p of n.params as AnyNode[]) visitPatternDefaults(p, inner, visit);
        visit(n.body, inner);
        return;
      }
      case "VariableDeclarator":
        visitPatternDefaults(n.id as AnyNode, b, visit);
        visit(n.init, b);
        return;
      case "LabeledStatement":
      case "BreakStatement":
      case "ContinueStatement":
        return;
      default:
        for (const [key, value] of Object.entries(n)) {
          if (key !== "type" && key !== "start" && key !== "end") visit(value, b);
        }
    }
  };
  visit(node, bound);
  return out;
}

/** 分割代入などのパターンで宣言される名前を names に足す。 */
function patternNames(p: AnyNode, names: Set<string>) {
  switch (p.type) {
    case "Identifier":
      names.add(p.name as string);
      break;
    case "ObjectPattern":
      for (const prop of p.properties as AnyNode[]) {
        patternNames((prop.type === "RestElement" ? prop.argument : prop.value) as AnyNode, names);
      }
      break;
    case "ArrayPattern":
      for (const el of p.elements as (AnyNode | null)[]) if (el) patternNames(el, names);
      break;
    case "RestElement":
      patternNames(p.argument as AnyNode, names);
      break;
    case "AssignmentPattern":
      patternNames(p.left as AnyNode, names);
      break;
  }
}

/** パターンの中の既定値（`(a = x) => ...` の x）と computed key を式として訪れる。 */
function visitPatternDefaults(
  p: AnyNode,
  bound: ReadonlySet<string>,
  visit: (n: unknown, b: ReadonlySet<string>) => void,
) {
  switch (p.type) {
    case "AssignmentPattern":
      visitPatternDefaults(p.left as AnyNode, bound, visit);
      visit(p.right, bound);
      break;
    case "ObjectPattern":
      for (const prop of p.properties as AnyNode[]) {
        if (prop.type === "RestElement")
          visitPatternDefaults(prop.argument as AnyNode, bound, visit);
        else {
          if (prop.computed) visit(prop.key, bound);
          visitPatternDefaults(prop.value as AnyNode, bound, visit);
        }
      }
      break;
    case "ArrayPattern":
      for (const el of p.elements as (AnyNode | null)[])
        if (el) visitPatternDefaults(el, bound, visit);
      break;
    case "RestElement":
      visitPatternDefaults(p.argument as AnyNode, bound, visit);
      break;
  }
}

/** 関数本体で宣言される変数（入れ子の関数の中は見ない）。 */
function declaredNames(body: unknown, names: Set<string>) {
  if (Array.isArray(body)) return body.forEach((b) => declaredNames(b, names));
  if (!isNode(body)) return;
  if (body.type === "ArrowFunctionExpression" || body.type === "FunctionExpression") return;
  if (body.type === "VariableDeclarator") patternNames(body.id as AnyNode, names);
  if (body.type === "FunctionDeclaration" && isNode(body.id)) names.add(body.id.name as string);
  for (const [key, value] of Object.entries(body)) {
    if (key !== "type" && key !== "start" && key !== "end") declaredNames(value, names);
  }
}
