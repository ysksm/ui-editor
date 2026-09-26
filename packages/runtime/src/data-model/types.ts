/**
 * データモデル（`dataModel.source` の TS 型）を解析した結果の形。
 * TS の型のうち、データの形を表すのに必要な部分だけを扱う。
 */

export type PrimitiveName = "string" | "number" | "boolean" | "null" | "undefined" | "unknown";

export type TypeRef =
  | { kind: "primitive"; name: PrimitiveName }
  /** `"online"` や `42` などのリテラル型。 */
  | { kind: "literal"; value: string | number | boolean }
  /** `T[]` / `Array<T>` */
  | { kind: "array"; element: TypeRef }
  /** `{ a: string }` */
  | { kind: "object"; fields: FieldDef[] }
  | { kind: "union"; types: TypeRef[] }
  /** 同じソース内で宣言した型の名前。 */
  | { kind: "ref"; name: string }
  /** 解釈できない型（ジェネリクス・交差型など）。元のテキストを持つ。 */
  | { kind: "unsupported"; text: string };

export interface FieldDef {
  name: string;
  type: TypeRef;
  /** `?` が付いていれば true。 */
  optional: boolean;
  /** JSDoc の説明。 */
  description?: string | undefined;
}

export interface TypeDecl {
  name: string;
  /** `interface X {}` か `type X = ...` か。 */
  declaration: "interface" | "type";
  type: TypeRef;
  description?: string | undefined;
}

export interface DataModelDiagnostic {
  message: string;
  /** 関係する宣言の名前（あれば）。 */
  declaration?: string | undefined;
  /** ソースの行（1 始まり、分かる場合）。 */
  line?: number | undefined;
}

export interface ParsedDataModel {
  declarations: TypeDecl[];
  diagnostics: DataModelDiagnostic[];
}
