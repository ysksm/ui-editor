import { formatType } from "./print.js";
import type { TypeDecl, TypeRef } from "./types.js";

/** 値の検査で見つかった型の不一致。`path` は値の中の位置（空ならその値自体）。 */
export interface ValueIssue {
  path: (string | number)[];
  message: string;
}

/**
 * `sampleData` のコレクション名に対応するデータモデルの型名を探す。
 * スキーマ v0 にはコレクションと型を結ぶ定義が無いため、名前の規約で決める:
 * `deviceSettings` → `DeviceSettings`、`devices` → `Device`（末尾の s / es を外す）。
 */
export function modelForCollection(collection: string, decls: TypeDecl[]): TypeDecl | undefined {
  const pascal = collection.charAt(0).toUpperCase() + collection.slice(1);
  const candidates = [
    pascal,
    pascal.replace(/ies$/, "y"),
    pascal.replace(/e?s$/, ""),
    pascal.replace(/s$/, ""),
  ];
  for (const name of candidates) {
    const decl = decls.find((d) => d.name === name && d.type.kind === "object");
    if (decl) return decl;
  }
  return undefined;
}

/** 値が型に合うか検査する。オブジェクトの余分なキー・必須フィールドの欠落も報告する。 */
export function checkValue(value: unknown, type: TypeRef, decls: TypeDecl[]): ValueIssue[] {
  const issues: ValueIssue[] = [];
  check(value, type, decls, [], issues);
  return issues;
}

/** 型に合う初期値（新しいレコードの追加用）。 */
export function defaultValue(type: TypeRef, decls: TypeDecl[], seen = new Set<string>()): unknown {
  switch (type.kind) {
    case "primitive":
      return { string: "", number: 0, boolean: false, null: null, undefined: null, unknown: null }[
        type.name
      ];
    case "literal":
      return type.value;
    case "array":
      return [];
    case "object":
      return Object.fromEntries(
        type.fields
          .filter((f) => !f.optional)
          .map((f) => [f.name, defaultValue(f.type, decls, seen)]),
      );
    case "union": {
      // null を許すならそれを、そうでなければ最初の候補を使う
      const nullable = type.types.find((t) => t.kind === "primitive" && t.name === "null");
      return defaultValue(nullable ?? type.types[0]!, decls, seen);
    }
    case "ref": {
      const decl = decls.find((d) => d.name === type.name);
      if (!decl || seen.has(type.name)) return null;
      return defaultValue(decl.type, decls, new Set([...seen, type.name]));
    }
    case "unsupported":
      return null;
  }
}

export interface CollectionCheck {
  collection: string;
  /** 対応するデータモデルの型名。見つからなければ undefined（検査しない）。 */
  model: string | undefined;
  /** `path[0]` はレコードの位置。 */
  issues: ValueIssue[];
}

/** `sampleData` 全体をデータモデルの型で検査する。 */
export function checkSampleData(
  sampleData: Record<string, unknown[]>,
  decls: TypeDecl[],
): CollectionCheck[] {
  return Object.entries(sampleData).map(([collection, records]) => {
    const model = modelForCollection(collection, decls);
    if (!model) return { collection, model: undefined, issues: [] };
    return {
      collection,
      model: model.name,
      issues: checkValue(records, { kind: "array", element: model.type }, decls),
    };
  });
}

// ---- 内部 ----

function describe(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "配列";
  if (typeof value === "object") return "オブジェクト";
  if (typeof value === "string") return JSON.stringify(value);
  return String(value);
}

function mismatch(value: unknown, type: TypeRef): string {
  return `${formatType(type)} が必要ですが ${describe(value)} です`;
}

function check(
  value: unknown,
  type: TypeRef,
  decls: TypeDecl[],
  path: (string | number)[],
  issues: ValueIssue[],
): void {
  switch (type.kind) {
    case "primitive": {
      const ok =
        type.name === "unknown" ||
        (type.name === "null"
          ? value === null
          : type.name === "undefined"
            ? value === undefined
            : typeof value === type.name);
      if (!ok) issues.push({ path, message: mismatch(value, type) });
      return;
    }
    case "literal":
      if (value !== type.value) issues.push({ path, message: mismatch(value, type) });
      return;
    case "array":
      if (!Array.isArray(value)) {
        issues.push({ path, message: mismatch(value, type) });
        return;
      }
      value.forEach((v, i) => check(v, type.element, decls, [...path, i], issues));
      return;
    case "object": {
      if (value === null || typeof value !== "object" || Array.isArray(value)) {
        issues.push({ path, message: mismatch(value, type) });
        return;
      }
      const record = value as Record<string, unknown>;
      for (const field of type.fields) {
        if (!(field.name in record) || record[field.name] === undefined) {
          if (!field.optional)
            issues.push({ path: [...path, field.name], message: "必須のフィールドがありません" });
          continue;
        }
        check(record[field.name], field.type, decls, [...path, field.name], issues);
      }
      const known = new Set(type.fields.map((f) => f.name));
      for (const key of Object.keys(record)) {
        if (!known.has(key))
          issues.push({ path: [...path, key], message: "型に無いフィールドです" });
      }
      return;
    }
    case "union": {
      // どれか 1 つに合えばよい。合わなければ、いちばん近い候補（問題の少ないもの）の結果を出す
      let best: ValueIssue[] | undefined;
      for (const t of type.types) {
        const sub: ValueIssue[] = [];
        check(value, t, decls, path, sub);
        if (sub.length === 0) return;
        const shallow = sub.every((i) => i.path.length === path.length);
        if (!shallow && (!best || sub.length < best.length)) best = sub;
      }
      issues.push(...(best ?? [{ path, message: mismatch(value, type) }]));
      return;
    }
    case "ref": {
      const decl = decls.find((d) => d.name === type.name);
      if (!decl) {
        issues.push({ path, message: `型 ${type.name} が見つかりません` });
        return;
      }
      // 再帰する型でも値は有限なので、そのまま辿ってよい
      const sub: ValueIssue[] = [];
      check(value, decl.type, decls, path, sub);
      // 値そのものが合わないときは、展開した型ではなく型名で報告する
      if (sub.length > 0 && sub.every((i) => i.path.length === path.length))
        issues.push({ path, message: mismatch(value, type) });
      else issues.push(...sub);
      return;
    }
    case "unsupported":
      return;
  }
}
