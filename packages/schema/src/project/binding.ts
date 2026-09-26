/** `{{ 式 }}` 形式のバインディングの補助関数。 */

const BINDING = /\{\{([\s\S]*?)\}\}/g;
const WHOLE_BINDING = /^\{\{([\s\S]*?)\}\}$/;

/** 文字列に含まれるバインディング式（前後の空白は除く）を返す。 */
export function extractExpressions(text: string): string[] {
  return [...text.matchAll(BINDING)].map((m) => (m[1] ?? "").trim());
}

export function hasBinding(text: string): boolean {
  return extractExpressions(text).length > 0;
}

/**
 * 文字列全体が 1 つのバインディングなら、その式を返す。
 * この場合は式の値をそのまま（文字列化せずに）使う。
 */
export function wholeExpression(text: string): string | undefined {
  const m = WHOLE_BINDING.exec(text.trim());
  if (!m || extractExpressions(text).length !== 1) return undefined;
  return (m[1] ?? "").trim();
}

/** 括弧の対応や空の式など、明らかな書き間違いを返す。 */
export function checkTemplate(text: string): string | undefined {
  let rest = text;
  for (;;) {
    const open = rest.indexOf("{{");
    const close = rest.indexOf("}}");
    if (open === -1 && close === -1) return undefined;
    if (open === -1 || (close !== -1 && close < open)) return "`}}` に対応する `{{` がありません";
    const end = rest.indexOf("}}", open + 2);
    if (end === -1) return "`{{` が閉じられていません";
    if (rest.slice(open + 2, end).trim() === "") return "`{{ }}` の中が空です";
    rest = rest.slice(end + 2);
  }
}
