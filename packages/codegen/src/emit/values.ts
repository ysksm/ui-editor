import type { JsonValue } from "@ui-editor/schema";
import { templateExpr, type Scope } from "./binding.js";

/** JSON の値を TS の式にする。文字列のバインディングは式に変換する。 */
export function valueExpr(value: JsonValue, scope: Scope, where: string): string {
  if (typeof value === "string") return templateExpr(value, scope, where);
  if (Array.isArray(value)) {
    return `[${value.map((v, i) => valueExpr(v, scope, `${where}[${i}]`)).join(", ")}]`;
  }
  if (value !== null && typeof value === "object") {
    const fields = Object.entries(value).map(
      ([k, v]) => `${propertyKey(k)}: ${valueExpr(v as JsonValue, scope, `${where}.${k}`)}`,
    );
    return `{ ${fields.join(", ")} }`;
  }
  return JSON.stringify(value);
}

function propertyKey(key: string): string {
  return /^[A-Za-z_$][\w$]*$/.test(key) ? key : JSON.stringify(key);
}
