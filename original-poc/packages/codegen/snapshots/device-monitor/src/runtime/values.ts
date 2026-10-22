/** 値の表示・判定の補助（エディタのプレビューと同じ規則）。 */

/** 文字列にする。null / undefined は空、オブジェクトと配列は JSON。 */
export function text(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

/** 値があるか（undefined・null・false・空文字でない）。Button の requires の判定に使う。 */
export function present(value: unknown): boolean {
  return value !== undefined && value !== null && value !== false && value !== "";
}

/** ドット区切りのパス（`filter.keyword`）に値を入れた新しいオブジェクトを返す（途中が無ければ作る）。 */
export function setPath<T extends object>(root: T, path: string, value: unknown): T {
  const [head, ...rest] = path.split(".");
  if (head === undefined) return { ...root };
  if (rest.length === 0) return { ...root, [head]: value };
  const child: unknown = (root as Record<string, unknown>)[head];
  const base = child !== null && typeof child === "object" && !Array.isArray(child) ? child : {};
  return { ...root, [head]: setPath(base, rest.join("."), value) };
}
