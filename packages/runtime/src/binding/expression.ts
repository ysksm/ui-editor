import ts from "typescript";

/**
 * `{{ }}` の中の式を評価する。
 *
 * 方式: 式を TS のパーサーで検査してから `new Function` で評価する。
 * - 検査: 1 つの式であること / 参照できる名前はスコープの名前と `ALLOWED_GLOBALS` だけ /
 *   代入・インクリメント・delete を使わない / `constructor` などのプロパティに触らない
 * - 評価: スコープの名前を引数にした関数を作る（式ごと・名前の組ごとにキャッシュ）
 *
 * `new Function` は完全なサンドボックスではない（計算したプロパティ名で `constructor` に触るなど、
 * 抜け道は残る）。エディタ上で自分が書いた式を動かす用途に限る。
 */

/** 式から参照できるグローバル。これ以外の名前（`window`, `fetch` など）は使えない。 */
export const ALLOWED_GLOBALS = [
  "Math",
  "JSON",
  "Number",
  "String",
  "Boolean",
  "Array",
  "Object",
  "Date",
  "structuredClone",
  "parseInt",
  "parseFloat",
  "isNaN",
  "isFinite",
  "encodeURIComponent",
  "undefined",
  "NaN",
  "Infinity",
] as const;

const ALLOWED = new Set<string>(ALLOWED_GLOBALS);
const BLOCKED_PROPERTIES = new Set(["constructor", "__proto__", "prototype", "__defineGetter__"]);

/** 式から参照できる値（名前 → 値）。`data` / `state` / `params` / `props` / `event` / ループ変数など。 */
export type Scope = Readonly<Record<string, unknown>>;

export type EvalResult = { ok: true; value: unknown } | { ok: false; error: string };

export interface ExpressionAnalysis {
  /** 構文や禁止事項のエラー。あれば評価しない。 */
  error?: string | undefined;
  /** 式が参照している（式の中で宣言していない）名前。 */
  freeNames: string[];
}

const analysisCache = new Map<string, ExpressionAnalysis>();
const compiled = new Map<string, (...args: unknown[]) => unknown>();

/** 式を検査する（スコープに依存しない部分）。結果はキャッシュする。 */
export function analyzeExpression(expr: string): ExpressionAnalysis {
  let result = analysisCache.get(expr);
  if (!result) {
    result = analyze(expr);
    analysisCache.set(expr, result);
  }
  return result;
}

/** 式が参照している名前のうち、`names` にも許可したグローバルにも無いもの。 */
export function unknownNames(expr: string, names: Iterable<string>): string[] {
  const known = new Set(names);
  return analyzeExpression(expr).freeNames.filter((n) => !known.has(n) && !ALLOWED.has(n));
}

/** 式を評価する。例外は投げず、エラーは結果として返す。 */
export function evaluateExpression(expr: string, scope: Scope): EvalResult {
  const analysis = analyzeExpression(expr);
  if (analysis.error) return { ok: false, error: analysis.error };
  const names = Object.keys(scope);
  const unknown = unknownNames(expr, names);
  if (unknown.length > 0) return { ok: false, error: `${unknown.join(", ")} は定義されていません` };

  const key = `${names.join(",")}\n${expr}`;
  let fn = compiled.get(key);
  if (!fn) {
    try {
      fn = new Function(...names, `"use strict";\nreturn (${expr}\n);`) as (
        ...a: unknown[]
      ) => unknown;
    } catch (e) {
      return { ok: false, error: errorMessage(e) };
    }
    compiled.set(key, fn);
  }
  try {
    return { ok: true, value: fn(...names.map((n) => scope[n])) };
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
}

function errorMessage(e: unknown): string {
  return e instanceof Error ? `${e.name}: ${e.message}` : String(e);
}

// ---- 検査 ----

function analyze(expr: string): ExpressionAnalysis {
  const text = `(${expr}\n)`;
  const file = ts.createSourceFile("expr.ts", text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const syntax = (file as unknown as { parseDiagnostics?: ts.Diagnostic[] }).parseDiagnostics ?? [];
  if (syntax[0]) {
    return {
      error: `構文エラー: ${ts.flattenDiagnosticMessageText(syntax[0].messageText, "\n")}`,
      freeNames: [],
    };
  }
  // `a), (b` のように括弧を閉じて別の式を続けたものを弾く
  const stmt = file.statements[0];
  if (
    file.statements.length !== 1 ||
    !stmt ||
    !ts.isExpressionStatement(stmt) ||
    !ts.isParenthesizedExpression(stmt.expression) ||
    stmt.expression.getStart(file) !== 0 ||
    stmt.expression.end !== text.length
  ) {
    return { error: "式を 1 つだけ書いてください", freeNames: [] };
  }

  const free = new Set<string>();
  let error: string | undefined;
  const fail = (message: string) => (error ??= message);

  const visit = (node: ts.Node, bound: ReadonlySet<string>): void => {
    if (ts.isIdentifier(node)) {
      if (!bound.has(node.text)) free.add(node.text);
      return;
    }
    if (ts.isPropertyAccessExpression(node)) {
      if (BLOCKED_PROPERTIES.has(node.name.text)) fail(`${node.name.text} は参照できません`);
      visit(node.expression, bound);
      return;
    }
    if (ts.isElementAccessExpression(node) && ts.isStringLiteralLike(node.argumentExpression)) {
      if (BLOCKED_PROPERTIES.has(node.argumentExpression.text))
        fail(`${node.argumentExpression.text} は参照できません`);
    }
    if (ts.isPropertyAssignment(node)) {
      if (ts.isComputedPropertyName(node.name)) visit(node.name, bound);
      visit(node.initializer, bound);
      return;
    }
    if (ts.isShorthandPropertyAssignment(node)) {
      visit(node.name, bound);
      return;
    }
    if (ts.isArrowFunction(node) || ts.isFunctionExpression(node)) {
      const inner = new Set(bound);
      for (const p of node.parameters) bindingNames(p.name, inner);
      for (const p of node.parameters) {
        if (p.initializer) visit(p.initializer, inner);
        visitBindingDefaults(p.name, inner, visit);
      }
      visit(node.body, inner);
      return;
    }
    if (ts.isBinaryExpression(node) && isAssignment(node.operatorToken.kind)) {
      fail("式の中で代入はできません");
    }
    if (
      (ts.isPrefixUnaryExpression(node) || ts.isPostfixUnaryExpression(node)) &&
      (node.operator === ts.SyntaxKind.PlusPlusToken ||
        node.operator === ts.SyntaxKind.MinusMinusToken)
    ) {
      fail("式の中で ++ / -- は使えません");
    }
    if (ts.isDeleteExpression(node)) fail("式の中で delete は使えません");
    if (node.kind === ts.SyntaxKind.ThisKeyword) fail("this は使えません");
    // 型注釈などの TS 固有の構文は JS として評価できないので弾く
    if (
      ts.isTypeNode(node) ||
      ts.isAsExpression(node) ||
      ts.isNonNullExpression(node) ||
      ts.isTypeAssertionExpression(node)
    ) {
      fail("TS の型の構文は使えません");
      return;
    }
    ts.forEachChild(node, (child) => visit(child, bound));
  };
  visit(stmt.expression, new Set());

  return { error, freeNames: [...free] };
}

function isAssignment(kind: ts.SyntaxKind): boolean {
  return kind >= ts.SyntaxKind.FirstAssignment && kind <= ts.SyntaxKind.LastAssignment;
}

function bindingNames(name: ts.BindingName, out: Set<string>): void {
  if (ts.isIdentifier(name)) out.add(name.text);
  else for (const el of name.elements) if (!ts.isOmittedExpression(el)) bindingNames(el.name, out);
}

function visitBindingDefaults(
  name: ts.BindingName,
  bound: ReadonlySet<string>,
  visit: (node: ts.Node, bound: ReadonlySet<string>) => void,
): void {
  if (ts.isIdentifier(name)) return;
  for (const el of name.elements) {
    if (ts.isOmittedExpression(el)) continue;
    if (el.initializer) visit(el.initializer, bound);
    if (el.propertyName && ts.isComputedPropertyName(el.propertyName))
      visit(el.propertyName, bound);
    visitBindingDefaults(el.name, bound, visit);
  }
}
