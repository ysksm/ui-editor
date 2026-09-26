import type { FieldDef, TypeDecl, TypeRef } from "./types.js";

const IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

/** 型を 1 行の TS の型式にする。 */
export function formatType(type: TypeRef): string {
  switch (type.kind) {
    case "primitive":
      return type.name;
    case "literal":
      return typeof type.value === "string" ? JSON.stringify(type.value) : String(type.value);
    case "array": {
      const el = formatType(type.element);
      return type.element.kind === "union" ? `(${el})[]` : `${el}[]`;
    }
    case "object":
      return type.fields.length === 0
        ? "{}"
        : `{ ${type.fields.map((f) => formatField(f)).join("; ")} }`;
    case "union":
      return type.types.map(formatType).join(" | ");
    case "ref":
      return type.name;
    case "unsupported":
      return type.text;
  }
}

function formatField(field: FieldDef): string {
  const name = IDENTIFIER.test(field.name) ? field.name : JSON.stringify(field.name);
  return `${name}${field.optional ? "?" : ""}: ${formatType(field.type)}`;
}

function docComment(description: string | undefined, indent: string): string {
  if (!description) return "";
  const lines = description.split("\n");
  if (lines.length === 1) return `${indent}/** ${lines[0]} */\n`;
  return `${indent}/**\n${lines.map((l) => `${indent} * ${l}`).join("\n")}\n${indent} */\n`;
}

/**
 * 宣言の一覧を `dataModel.source` 用の TS ソースに書き出す。
 * `interface` のトップレベルのフィールドは 1 行ずつ、入れ子のオブジェクトは 1 行に書く。
 */
export function printDataModel(declarations: TypeDecl[]): string {
  return declarations
    .map((decl) => {
      const head = docComment(decl.description, "");
      if (decl.declaration === "interface" && decl.type.kind === "object") {
        const body = decl.type.fields
          .map((f) => `${docComment(f.description, "  ")}  ${formatField(f)};\n`)
          .join("");
        return `${head}interface ${decl.name} {\n${body}}\n`;
      }
      return `${head}type ${decl.name} = ${formatType(decl.type)};\n`;
    })
    .join("\n");
}
