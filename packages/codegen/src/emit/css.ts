import type { Style } from "@ui-editor/schema";

/** 数値に px を付けない CSS プロパティ。 */
const UNITLESS = new Set(["flex", "flexGrow", "flexShrink", "fontWeight", "opacity", "zIndex"]);

/** `backgroundColor` → `background-color` */
export function cssProperty(name: string): string {
  return name.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
}

/** style の値を CSS の値にする。数値は px（UNITLESS 以外）。 */
export function cssValue(name: string, value: string | number): string {
  return typeof value === "number" && !UNITLESS.has(name) && value !== 0
    ? `${value}px`
    : `${value}`;
}

/** CSS Modules の 1 クラス分の宣言を並べる。 */
export function cssRule(className: string, declarations: [string, string | number][]): string {
  const body = declarations.map(([k, v]) => `  ${cssProperty(k)}: ${cssValue(k, v)};`).join("\n");
  return `.${className} {\n${body}\n}\n`;
}

export type StyleEntry = [keyof Style & string, string | number];

/** style をプロパティの並び（ファイルに書かれた順）にする。 */
export function styleEntries(style: Style | undefined): StyleEntry[] {
  return Object.entries(style ?? {}).filter(
    (e): e is StyleEntry => typeof e[1] === "string" || typeof e[1] === "number",
  );
}
