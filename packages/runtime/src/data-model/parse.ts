import ts from "typescript";
import type {
  DataModelDiagnostic,
  FieldDef,
  ParsedDataModel,
  PrimitiveName,
  TypeDecl,
  TypeRef,
} from "./types.js";

/**
 * `dataModel.source`（型定義だけの TS ソース）を TypeScript Compiler API で解析し、
 * 宣言ごとのフィールド一覧に変換する。型チェッカーは使わず、構文木だけを見る
 * （ブラウザで lib.d.ts なしに動かすため）。
 */
export function parseDataModel(source: string): ParsedDataModel {
  const diagnostics: DataModelDiagnostic[] = syntaxDiagnostics(source);
  const file = ts.createSourceFile("model.ts", source, ts.ScriptTarget.Latest, true);
  const declarations: TypeDecl[] = [];

  const lineOf = (node: ts.Node) => file.getLineAndCharacterOfPosition(node.getStart()).line + 1;
  const ctx: Ctx = {
    file,
    report: (message, node, declaration) =>
      diagnostics.push({ message, declaration, line: lineOf(node) }),
    declaration: "",
  };

  for (const stmt of file.statements) {
    if (ts.isInterfaceDeclaration(stmt)) {
      ctx.declaration = stmt.name.text;
      if (stmt.typeParameters)
        ctx.report("ジェネリクスには対応していません", stmt, ctx.declaration);
      if (stmt.heritageClauses) ctx.report("extends には対応していません", stmt, ctx.declaration);
      declarations.push({
        name: stmt.name.text,
        declaration: "interface",
        type: { kind: "object", fields: convertMembers(stmt.members, ctx) },
        description: jsDocOf(stmt),
      });
    } else if (ts.isTypeAliasDeclaration(stmt)) {
      ctx.declaration = stmt.name.text;
      if (stmt.typeParameters)
        ctx.report("ジェネリクスには対応していません", stmt, ctx.declaration);
      declarations.push({
        name: stmt.name.text,
        declaration: "type",
        type: convertType(stmt.type, ctx),
        description: jsDocOf(stmt),
      });
    } else {
      ctx.report("型定義（interface / type）以外の文は無視します", stmt, undefined);
    }
  }

  const seen = new Set<string>();
  for (const decl of declarations) {
    if (seen.has(decl.name))
      diagnostics.push({ message: `型 ${decl.name} が重複しています`, declaration: decl.name });
    seen.add(decl.name);
  }
  for (const decl of declarations) {
    for (const name of referencedNames(decl.type)) {
      if (!seen.has(name))
        diagnostics.push({ message: `型 ${name} が見つかりません`, declaration: decl.name });
    }
  }

  return { declarations, diagnostics };
}

/** `"online" | "offline"` のような型式 1 つを解析する（フィールドの型の入力用）。 */
export function parseTypeExpression(text: string): {
  type: TypeRef;
  diagnostics: DataModelDiagnostic[];
} {
  const result = parseDataModel(`type __T = ${text};`);
  const decl = result.declarations[0];
  const diagnostics = result.diagnostics.filter((d) => !d.message.startsWith("型 __T"));
  if (!decl || result.declarations.length !== 1 || diagnostics.length > 0) {
    return {
      type: decl?.type ?? { kind: "unsupported", text },
      diagnostics: diagnostics.length > 0 ? diagnostics : [{ message: "型を解釈できません" }],
    };
  }
  return { type: decl.type, diagnostics: [] };
}

/** オブジェクト型の宣言（= データモデルとして一覧に出すもの）か。 */
export function isModelDecl(decl: TypeDecl): boolean {
  return decl.type.kind === "object";
}

/** 型の中で参照している宣言名（重複なし）。 */
export function referencedNames(type: TypeRef): string[] {
  const names = new Set<string>();
  const walk = (t: TypeRef): void => {
    switch (t.kind) {
      case "ref":
        names.add(t.name);
        break;
      case "array":
        walk(t.element);
        break;
      case "union":
        t.types.forEach(walk);
        break;
      case "object":
        t.fields.forEach((f) => walk(f.type));
        break;
    }
  };
  walk(type);
  return [...names];
}

// ---- 内部 ----

interface Ctx {
  file: ts.SourceFile;
  report: (message: string, node: ts.Node, declaration: string | undefined) => void;
  declaration: string;
}

function syntaxDiagnostics(source: string): DataModelDiagnostic[] {
  const out = ts.transpileModule(source, {
    reportDiagnostics: true,
    compilerOptions: { target: ts.ScriptTarget.Latest },
  });
  return (out.diagnostics ?? []).map((d) => ({
    message: ts.flattenDiagnosticMessageText(d.messageText, "\n"),
    line:
      d.file && d.start !== undefined
        ? d.file.getLineAndCharacterOfPosition(d.start).line + 1
        : undefined,
  }));
}

function convertMembers(members: ts.NodeArray<ts.TypeElement>, ctx: Ctx): FieldDef[] {
  const fields: FieldDef[] = [];
  for (const member of members) {
    if (!ts.isPropertySignature(member) || !member.type) {
      ctx.report("プロパティ以外のメンバー（メソッドなど）は無視します", member, ctx.declaration);
      continue;
    }
    const name = propertyName(member.name);
    if (name === undefined) {
      ctx.report("計算されたプロパティ名には対応していません", member, ctx.declaration);
      continue;
    }
    fields.push({
      name,
      type: convertType(member.type, ctx),
      optional: member.questionToken !== undefined,
      description: jsDocOf(member),
    });
  }
  return fields;
}

function propertyName(name: ts.PropertyName): string | undefined {
  if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name))
    return name.text;
  return undefined;
}

const KEYWORDS: Partial<Record<ts.SyntaxKind, PrimitiveName>> = {
  [ts.SyntaxKind.StringKeyword]: "string",
  [ts.SyntaxKind.NumberKeyword]: "number",
  [ts.SyntaxKind.BooleanKeyword]: "boolean",
  [ts.SyntaxKind.UndefinedKeyword]: "undefined",
  [ts.SyntaxKind.UnknownKeyword]: "unknown",
  [ts.SyntaxKind.AnyKeyword]: "unknown",
};

function convertType(node: ts.TypeNode, ctx: Ctx): TypeRef {
  const keyword = KEYWORDS[node.kind];
  if (keyword) return { kind: "primitive", name: keyword };

  if (ts.isParenthesizedTypeNode(node)) return convertType(node.type, ctx);
  if (ts.isArrayTypeNode(node))
    return { kind: "array", element: convertType(node.elementType, ctx) };
  if (ts.isTypeLiteralNode(node))
    return { kind: "object", fields: convertMembers(node.members, ctx) };
  if (ts.isUnionTypeNode(node))
    return { kind: "union", types: node.types.map((t) => convertType(t, ctx)) };

  if (ts.isLiteralTypeNode(node)) {
    const lit = node.literal;
    if (lit.kind === ts.SyntaxKind.NullKeyword) return { kind: "primitive", name: "null" };
    if (lit.kind === ts.SyntaxKind.TrueKeyword) return { kind: "literal", value: true };
    if (lit.kind === ts.SyntaxKind.FalseKeyword) return { kind: "literal", value: false };
    if (ts.isStringLiteral(lit)) return { kind: "literal", value: lit.text };
    if (ts.isNumericLiteral(lit)) return { kind: "literal", value: Number(lit.text) };
    if (
      ts.isPrefixUnaryExpression(lit) &&
      lit.operator === ts.SyntaxKind.MinusToken &&
      ts.isNumericLiteral(lit.operand)
    )
      return { kind: "literal", value: -Number(lit.operand.text) };
  }

  if (ts.isTypeReferenceNode(node) && ts.isIdentifier(node.typeName)) {
    const name = node.typeName.text;
    const args = node.typeArguments ?? [];
    if ((name === "Array" || name === "ReadonlyArray") && args.length === 1 && args[0])
      return { kind: "array", element: convertType(args[0], ctx) };
    if (args.length === 0) return { kind: "ref", name };
  }

  const text = node.getText(ctx.file);
  ctx.report(`型 ${text} には対応していません`, node, ctx.declaration);
  return { kind: "unsupported", text };
}

function jsDocOf(node: ts.Node): string | undefined {
  const docs = ts.getJSDocCommentsAndTags(node).filter(ts.isJSDoc);
  const text = docs
    .map((d) => ts.getTextOfJSDocComment(d.comment) ?? "")
    .join("\n")
    .trim();
  return text === "" ? undefined : text;
}
