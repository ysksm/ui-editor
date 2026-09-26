import { extractExpressions, wholeExpression, type JsonValue } from "@ui-editor/schema";

/** バインディングで参照できる名前（`data` / `state` / `params` / `props` / repeat の変数など）。 */
export type Scope = Record<string, unknown>;

/**
 * キャンバスに表示するため、`{{ 式 }}` を評価する。
 * エディタ上のプレビューなので、評価できない式（repeat の変数が無いなど）は元の文字列のまま返す。
 */
export function resolveTemplate(text: string, scope: Scope): unknown {
  if (extractExpressions(text).length === 0) return text;
  const whole = wholeExpression(text);
  if (whole !== undefined) {
    const result = evaluate(whole, scope);
    return result.ok ? result.value : text;
  }
  let failed = false;
  const out = text.replace(/\{\{([\s\S]*?)\}\}/g, (raw, expr: string) => {
    const result = evaluate(expr.trim(), scope);
    if (!result.ok) {
      failed = true;
      return raw;
    }
    return result.value === undefined || result.value === null ? "" : String(result.value);
  });
  return failed ? text : out;
}

/** オブジェクト・配列の中の文字列もまとめて評価する。 */
export function resolveValue(value: JsonValue | undefined, scope: Scope): unknown {
  if (typeof value === "string") return resolveTemplate(value, scope);
  if (Array.isArray(value)) return value.map((v) => resolveValue(v, scope));
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, resolveValue(v, scope)]));
  }
  return value;
}

type EvalResult = { ok: true; value: unknown } | { ok: false };

const cache = new Map<string, (...args: unknown[]) => unknown>();

function evaluate(expr: string, scope: Scope): EvalResult {
  const names = Object.keys(scope);
  const key = `${names.join(",")}\n${expr}`;
  try {
    let fn = cache.get(key);
    if (!fn) {
      fn = new Function(...names, `"use strict"; return (${expr});`) as (
        ...args: unknown[]
      ) => unknown;
      cache.set(key, fn);
    }
    return { ok: true, value: fn(...names.map((n) => scope[n])) };
  } catch {
    return { ok: false };
  }
}
