import { extractExpressions, wholeExpression } from "@ui-editor/schema";
import { evaluateExpression, type Scope } from "./expression.js";

/** バインディングの評価エラー。`expression` はエラーになった式。 */
export interface BindingError {
  expression: string;
  error: string;
}

export interface Resolved<T = unknown> {
  value: T;
  errors: BindingError[];
}

const BINDING = /\{\{([\s\S]*?)\}\}/g;

/**
 * `{{ }}` を含む文字列を評価する。
 * - 文字列全体が 1 つの `{{ }}` なら式の値をそのまま返す（配列・オブジェクト・数値など）
 * - それ以外は各式の値を文字列にして埋め込む（null / undefined は空文字、オブジェクトは JSON）
 * - バインディングを含まない文字列はそのまま返す
 * エラーになった式は undefined（埋め込みでは空文字）として扱い、エラーを返す。
 */
export function evaluateTemplate(text: string, scope: Scope): Resolved {
  const whole = wholeExpression(text);
  if (whole !== undefined) {
    const r = evaluateExpression(whole, scope);
    return r.ok
      ? { value: r.value, errors: [] }
      : { value: undefined, errors: [{ expression: whole, error: r.error }] };
  }
  if (extractExpressions(text).length === 0) return { value: text, errors: [] };

  const errors: BindingError[] = [];
  const value = text.replace(BINDING, (_, raw: string) => {
    const expression = raw.trim();
    const r = evaluateExpression(expression, scope);
    if (!r.ok) {
      errors.push({ expression, error: r.error });
      return "";
    }
    return stringify(r.value);
  });
  return { value, errors };
}

/** 埋め込み用に値を文字列にする。 */
export function stringify(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

/**
 * JSON の値に含まれるすべての文字列を `evaluateTemplate` で評価する（props・アクションの引数用）。
 * オブジェクトと配列は中身を評価した新しいものを返す。
 */
export function resolveValue(value: unknown, scope: Scope): Resolved {
  const errors: BindingError[] = [];
  const walk = (v: unknown): unknown => {
    if (typeof v === "string") {
      const r = evaluateTemplate(v, scope);
      errors.push(...r.errors);
      return r.value;
    }
    if (Array.isArray(v)) return v.map(walk);
    if (v !== null && typeof v === "object")
      return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x)]));
    return v;
  };
  return { value: walk(value), errors };
}
