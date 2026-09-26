import { ALLOWED_GLOBALS, type Scope } from "./expression.js";

/** 入力補完の候補。 */
export interface Suggestion {
  label: string;
  /** 型や値の概要。 */
  detail: string;
  kind: "name" | "field" | "method";
}

export interface SuggestResult {
  /** 候補で置き換える範囲の開始位置（入力中の単語の先頭）。 */
  from: number;
  items: Suggestion[];
}

const ARRAY_METHODS = [
  "length",
  "find",
  "filter",
  "map",
  "some",
  "every",
  "findIndex",
  "includes",
  "at",
  "slice",
  "toSorted",
  "reduce",
  "join",
  "flatMap",
];
const STRING_METHODS = [
  "length",
  "slice",
  "replace",
  "toUpperCase",
  "toLowerCase",
  "includes",
  "startsWith",
  "localeCompare",
  "padStart",
  "split",
];
const NUMBER_METHODS = ["toFixed", "toString"];
const ELEMENT_METHODS =
  /\.(find|filter|map|some|every|findIndex|findLast|flatMap|toSorted|sort|reduce)\(?\s*$/;

/**
 * カーソルの前までの式から、入力補完の候補を返す（簡易版）。
 * スコープの実際の値（サンプルデータ）を辿って候補を出す:
 * - `dat` → スコープの名前・使えるグローバル
 * - `data.devices.` → 配列のメソッド、`data.devices.find(d => d.` → 要素のフィールド
 * 型情報は使わないので、値が空の配列や null のときは候補が出ない。
 */
export function suggest(textBeforeCursor: string, scope: Scope): SuggestResult {
  const m = /((?:[A-Za-z_$][\w$]*\??\.)*)([A-Za-z_$][\w$]*)?$/.exec(textBeforeCursor);
  const pathText = m?.[1] ?? "";
  const partial = m?.[2] ?? "";
  const from = textBeforeCursor.length - partial.length;
  // 直前がプロパティアクセスの `.` で終わる別の式（`foo().`）は対象外
  const before = textBeforeCursor.slice(0, from - pathText.length);
  if (pathText === "" && /[\w$.)\]]$/.test(before)) return { from, items: [] };
  if (pathText !== "" && /[)\]]$/.test(before)) return { from, items: [] };

  const names = {
    ...lambdaParams(textBeforeCursor.slice(0, from - pathText.length), scope),
    ...scope,
  };
  let items: Suggestion[];
  if (pathText === "") {
    items = [
      ...Object.entries(names).map(([label, v]) => ({
        label,
        detail: describe(v),
        kind: "name" as const,
      })),
      ...ALLOWED_GLOBALS.filter((g) => !(g in names)).map((label) => ({
        label,
        detail: "グローバル",
        kind: "name" as const,
      })),
    ];
  } else {
    const segments = pathText.split(/\??\./).filter(Boolean);
    const [root, ...rest] = segments;
    if (root === undefined || !(root in names)) return { from, items: [] };
    let value: unknown = names[root];
    for (const seg of rest) value = member(value, seg);
    items = membersOf(value);
  }
  return {
    from,
    items: items.filter((s) => s.label.startsWith(partial)),
  };
}

function member(value: unknown, key: string): unknown {
  if (value === null || value === undefined) return undefined;
  return (value as Record<string, unknown>)[key];
}

function membersOf(value: unknown): Suggestion[] {
  const methods = (labels: string[], detail: string) =>
    labels.map((label) => ({ label, detail, kind: "method" as const }));
  if (Array.isArray(value)) return methods(ARRAY_METHODS, `配列（${value.length} 件）`);
  if (typeof value === "string") return methods(STRING_METHODS, "文字列");
  if (typeof value === "number") return methods(NUMBER_METHODS, "数値");
  if (value !== null && typeof value === "object")
    return Object.entries(value).map(([label, v]) => ({
      label,
      detail: describe(v),
      kind: "field",
    }));
  return [];
}

/** 値の概要（候補の説明用）。 */
export function describe(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return `配列（${value.length} 件）`;
  if (typeof value === "string")
    return JSON.stringify(value.length > 24 ? `${value.slice(0, 24)}…` : value);
  if (typeof value === "object") return "オブジェクト";
  return String(value);
}

/**
 * `data.devices.find(d => d.` のようなアロー関数の引数に、配列の最初の要素を割り当てる。
 * `reduce((sum, d) =>` は 2 番目、`toSorted((a, b) =>` は両方が要素。
 */
function lambdaParams(text: string, scope: Scope): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const arrow = /\(?\s*([A-Za-z_$][\w$]*)(?:\s*,\s*([A-Za-z_$][\w$]*))?\s*\)?\s*=>/g;
  for (let m = arrow.exec(text); m; m = arrow.exec(text)) {
    const head = text.slice(0, m.index);
    const call = ELEMENT_METHODS.exec(head);
    if (!call) continue;
    const path = /((?:[A-Za-z_$][\w$]*\??\.)*[A-Za-z_$][\w$]*)$/.exec(
      head.slice(0, call.index),
    )?.[1];
    if (!path) continue;
    const [root, ...rest] = path.split(/\??\./);
    const names = { ...out, ...scope };
    if (root === undefined || !(root in names)) continue;
    let arr: unknown = names[root];
    for (const seg of rest) arr = member(arr, seg);
    if (!Array.isArray(arr)) continue;
    const element: unknown = arr[0];
    const [, first, second] = m;
    const method = call[1];
    if (method === "reduce") {
      if (second) out[second] = element;
    } else {
      if (first) out[first] = element;
      if (second && (method === "toSorted" || method === "sort")) out[second] = element;
    }
  }
  return out;
}
