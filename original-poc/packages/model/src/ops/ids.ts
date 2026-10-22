/** id を作る補助関数（architecture.md 4.7: 人が読める連番、乱数は使わない）。 */

/** `base` が空いていればそのまま、無ければ `base2`, `base3`, … */
export function uniqueId(base: string, taken: Iterable<string>): string {
  const set = new Set(taken);
  if (!set.has(base)) return base;
  for (let n = 2; ; n++) if (!set.has(`${base}${n}`)) return `${base}${n}`;
}

/** `base1`, `base2`, … のうち空いている最初のもの（新しく作るものの既定の id）。 */
export function numberedId(base: string, taken: Iterable<string>): string {
  const set = new Set(taken);
  for (let n = 1; ; n++) if (!set.has(`${base}${n}`)) return `${base}${n}`;
}

export function lowerFirst(s: string): string {
  return s.charAt(0).toLowerCase() + s.slice(1);
}

export function upperFirst(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** 英語の単純な複数形（Alarm → alarms、Category → categories、Box → boxes）。 */
export function pluralize(s: string): string {
  if (/(s|x|z|ch|sh)$/i.test(s)) return `${s}es`;
  if (/[^aeiou]y$/i.test(s)) return `${s.slice(0, -1)}ies`;
  return `${s}s`;
}
