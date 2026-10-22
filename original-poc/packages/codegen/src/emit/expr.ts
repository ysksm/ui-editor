import { extractExpressions, wholeExpression, type JsonValue } from "@ui-editor/poc-model";
import { ALLOWED_GLOBALS, analyzeExpression } from "@ui-editor/runtime";
import { propKey } from "../names.js";

/**
 * `{{ }}` を TS の式にする。式はそのまま埋め込み（P1 と同じ）、`@ui-editor/runtime` の
 * analyzeExpression で構文と使える名前を調べる（architecture.md 4.12）。
 *
 * | 元                         | 生成                                   |
 * | -------------------------- | -------------------------------------- |
 * | `{{ record?.name }}`       | `record?.name`（値そのもの）           |
 * | `型番: {{ record?.model }}` | `` `型番: ${text(record?.model)}` ``   |
 * | `機器一覧`                 | `"機器一覧"`                           |
 */

const BINDING = /\{\{([\s\S]*?)\}\}/g;
const ALLOWED = new Set<string>(ALLOWED_GLOBALS);

/** 式を書く場所（使える名前・誤りの報告・使った名前の記録）。 */
export interface ExprScope {
  /** その場所で使える名前（data・state・params・record・draft・errors・event・row など）。 */
  names: ReadonlySet<string>;
  /** 誤りの場所（例: `画面 deviceDetail / title / text`）。 */
  where: string;
  /** 式が使った名前（宣言するものを決めるのに使う）。 */
  used: Set<string>;
  problems: string[];
  /** `text()` を使ったとき true にする。 */
  usesText?: boolean;
}

/** 1 つの式。誤りは problems に入れ、`undefined` を返す。 */
export function expression(expr: string, scope: ExprScope): string {
  const analysis = analyzeExpression(expr);
  if (analysis.error) {
    scope.problems.push(`${scope.where}: {{ ${expr} }}: ${analysis.error}`);
    return "undefined";
  }
  const unknown = analysis.freeNames.filter((n) => !scope.names.has(n) && !ALLOWED.has(n));
  if (unknown.length > 0) {
    scope.problems.push(
      `${scope.where}: {{ ${expr} }}: ${unknown.join(", ")} はここでは使えません（使える名前: ${[...scope.names].join(", ")}）`,
    );
    return "undefined";
  }
  for (const n of analysis.freeNames) if (scope.names.has(n)) scope.used.add(n);
  return `(${expr})`;
}

/** 文字列（`{{ }}` を含みうる）。全体が 1 つの式なら値そのもの、混在なら文字列にして埋め込む。 */
export function template(text: string, scope: ExprScope): string {
  const whole = wholeExpression(text);
  if (whole !== undefined) return expression(whole, scope);
  if (extractExpressions(text).length === 0) return JSON.stringify(text);
  let out = "`";
  let last = 0;
  for (const m of text.matchAll(BINDING)) {
    out += escapeTemplate(text.slice(last, m.index));
    out += `\${text(${expression((m[1] ?? "").trim(), scope)})}`;
    last = m.index + m[0].length;
  }
  scope.usesText = true;
  return `${out}${escapeTemplate(text.slice(last))}\``;
}

/** JSON の値（中の文字列は template）。オブジェクト・配列はリテラルにする。 */
export function value(v: JsonValue | undefined, scope: ExprScope): string {
  if (v === undefined) return "undefined";
  if (typeof v === "string") return template(v, scope);
  if (v === null || typeof v !== "object") return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map((x) => value(x, scope)).join(", ")}]`;
  return `{ ${Object.entries(v)
    .map(([k, x]) => `${propKey(k)}: ${value(x, scope)}`)
    .join(", ")} }`;
}

/** 式を含まない固定の値か。 */
export function isStatic(v: JsonValue | undefined): boolean {
  if (typeof v === "string") return extractExpressions(v).length === 0;
  if (Array.isArray(v)) return v.every(isStatic);
  if (v !== null && typeof v === "object") return Object.values(v).every(isStatic);
  return true;
}

function escapeTemplate(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/`/g, "\\`").replace(/\$\{/g, "\\${");
}

/** JSX の属性（固定の文字列は `name="…"`、ほかは `name={…}`）。 */
export function attr(name: string, code: string): string {
  if (/^"[^"\\&{}<>\n]*"$/.test(code)) return `${name}=${code}`;
  if (code === "true") return name;
  return `${name}={${code}}`;
}
