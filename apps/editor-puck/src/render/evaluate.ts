import { extractExpressions, wholeExpression, type JsonValue } from "@ui-editor/schema";

/**
 * キャンバスのプレビュー用に `{{ 式 }}` を評価する。
 * 評価できるのはコンポーネントの中の `props` だけ（data / state / repeat の変数などはエディタでは値が無い）。
 * 評価できない式は元の文字列のまま返し、キャンバスに式として表示する。
 */

export type Scope = Record<string, unknown>;

type Compiled = (...args: unknown[]) => unknown;
const cache = new Map<string, Compiled>();

function compile(names: string[], expr: string): Compiled {
  const key = `${names.join(",")}\n${expr}`;
  let fn = cache.get(key);
  if (!fn) {
    fn = new Function(...names, `"use strict"; return (${expr});`) as Compiled;
    cache.set(key, fn);
  }
  return fn;
}

const FAILED = Symbol("failed");

function run(expr: string, scope: Scope): unknown {
  const names = Object.keys(scope);
  try {
    const value = compile(names, expr)(...names.map((n) => scope[n]));
    return value === undefined ? FAILED : value;
  } catch {
    return FAILED;
  }
}

/**
 * 評価できなかったとき、式が参照している props のうち「値そのものが未評価の式」のものがあれば、それを代わりに表示する。
 * 例: `StatusBadge` に `status: "{{ device.status }}"` を渡すと、中の `{{ (...)[props.status] }}` は評価できないが、
 * `{{ device.status }}` と表示する方が分かりやすい。
 */
function fallback(expr: string, scope: Scope, raw: string): string {
  const props = scope.props as Record<string, unknown> | undefined;
  for (const m of expr.matchAll(/\bprops\.([A-Za-z_]\w*)/g)) {
    const value = props?.[m[1]!];
    if (typeof value === "string" && extractExpressions(value).length > 0) return value;
  }
  return raw;
}

function stringify(value: unknown): string {
  if (value === null || value === undefined) return "";
  return typeof value === "object" ? JSON.stringify(value) : String(value);
}

/**
 * style 用: 評価できない値は（式の文字列を CSS に入れても無効なので）消す。
 * color と backgroundColor は組で決まる（白文字＋色付き背景など）ので、片方が消えたらもう片方も消す。
 */
export function evaluateStyle(
  style: Record<string, JsonValue> | undefined,
  scope: Scope,
): Record<string, unknown> | undefined {
  if (style === undefined) return undefined;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(style)) {
    const result = evaluate(value, scope);
    if (typeof result === "string" && extractExpressions(result).length > 0) continue;
    out[key] = result;
  }
  if (!("color" in out) || !("backgroundColor" in out)) {
    if (style.color !== undefined && style.backgroundColor !== undefined) {
      delete out.color;
      delete out.backgroundColor;
    }
  }
  return out;
}

export function evaluate(value: JsonValue | undefined, scope: Scope): unknown {
  if (typeof value === "string") {
    if (extractExpressions(value).length === 0) return value;
    const whole = wholeExpression(value);
    if (whole !== undefined) {
      const result = run(whole, scope);
      return result === FAILED ? fallback(whole, scope, value) : result;
    }
    return value.replace(/\{\{([\s\S]*?)\}\}/g, (raw, expr: string) => {
      const result = run(expr.trim(), scope);
      return result === FAILED ? fallback(expr, scope, raw) : stringify(result);
    });
  }
  if (Array.isArray(value)) return value.map((v) => evaluate(v, scope));
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, evaluate(v, scope)]));
  }
  return value;
}
