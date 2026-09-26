import type { JsonValue } from "@ui-editor/schema";

/**
 * P0 の props の値（任意の JSON。文字列は `{{ }}` を含んでよい）をテキスト欄で編集するための変換。
 * 文字列はそのまま、それ以外は JSON で表示する。
 */
export function valueToText(value: JsonValue | undefined): string {
  if (value === undefined) return "";
  return typeof value === "string" ? value : JSON.stringify(value);
}

/**
 * テキスト欄の入力を値に戻す。数値・真偽値・null・配列・オブジェクトとして読めるものは JSON として、
 * それ以外は文字列として扱う。空欄は undefined（プロパティを消す）。
 */
export function textToValue(text: string): JsonValue | undefined {
  if (text === "") return undefined;
  const trimmed = text.trim();
  if (/^(-?\d+(\.\d+)?|true|false|null)$/.test(trimmed) || /^[[{]/.test(trimmed)) {
    try {
      return JSON.parse(trimmed) as JsonValue;
    } catch {
      return text;
    }
  }
  return text;
}
