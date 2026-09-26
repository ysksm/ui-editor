import {
  parseTypeExpression,
  printDataModel,
  type FieldDef,
  type TypeDecl,
} from "@ui-editor/runtime";

/**
 * フォームでの編集操作。どれも宣言の一覧を受け取り、新しい一覧を返す。
 * 結果は `printDataModel` で TS ソースに戻し、`dataModel.source` に書き込む。
 */

export type FieldPatch = Partial<Pick<FieldDef, "name" | "optional" | "description">> & {
  /** 型は TS の型式のテキストで受け取る。解釈できなければそのまま残す（ソース上でエラーになる）。 */
  typeText?: string;
};

function mapDecl(decls: TypeDecl[], name: string, fn: (d: TypeDecl) => TypeDecl): TypeDecl[] {
  return decls.map((d) => (d.name === name ? fn(d) : d));
}

function mapFields(decls: TypeDecl[], name: string, fn: (fields: FieldDef[]) => FieldDef[]) {
  return mapDecl(decls, name, (d) =>
    d.type.kind === "object" ? { ...d, type: { kind: "object", fields: fn(d.type.fields) } } : d,
  );
}

export function uniqueName(base: string, taken: Iterable<string>): string {
  const set = new Set(taken);
  if (!set.has(base)) return base;
  for (let i = 2; ; i++) if (!set.has(`${base}${i}`)) return `${base}${i}`;
}

export function addModel(decls: TypeDecl[]): { decls: TypeDecl[]; name: string } {
  const name = uniqueName(
    "NewModel",
    decls.map((d) => d.name),
  );
  const decl: TypeDecl = {
    name,
    declaration: "interface",
    type: {
      kind: "object",
      fields: [{ name: "id", type: { kind: "primitive", name: "string" }, optional: false }],
    },
  };
  return { decls: [...decls, decl], name };
}

export function renameDecl(decls: TypeDecl[], from: string, to: string): TypeDecl[] {
  return mapDecl(decls, from, (d) => ({ ...d, name: to }));
}

export function setDeclDescription(decls: TypeDecl[], name: string, description: string) {
  return mapDecl(decls, name, (d) => ({ ...d, description: description || undefined }));
}

export function removeDecl(decls: TypeDecl[], name: string): TypeDecl[] {
  return decls.filter((d) => d.name !== name);
}

export function addField(decls: TypeDecl[], model: string): TypeDecl[] {
  return mapFields(decls, model, (fields) => [
    ...fields,
    {
      name: uniqueName(
        "field",
        fields.map((f) => f.name),
      ),
      type: { kind: "primitive", name: "string" },
      optional: false,
    },
  ]);
}

export function updateField(
  decls: TypeDecl[],
  model: string,
  index: number,
  patch: FieldPatch,
): TypeDecl[] {
  return mapFields(decls, model, (fields) =>
    fields.map((f, i) => {
      if (i !== index) return f;
      const { typeText, ...rest } = patch;
      const next: FieldDef = { ...f, ...rest };
      if (rest.description !== undefined) next.description = rest.description || undefined;
      if (typeText !== undefined) {
        const parsed = parseTypeExpression(typeText);
        next.type =
          parsed.diagnostics.length === 0 ? parsed.type : { kind: "unsupported", text: typeText };
      }
      return next;
    }),
  );
}

export function removeField(decls: TypeDecl[], model: string, index: number): TypeDecl[] {
  return mapFields(decls, model, (fields) => fields.filter((_, i) => i !== index));
}

export function moveField(decls: TypeDecl[], model: string, index: number, delta: -1 | 1) {
  return mapFields(decls, model, (fields) => {
    const to = index + delta;
    if (to < 0 || to >= fields.length) return fields;
    const next = [...fields];
    const [f] = next.splice(index, 1);
    next.splice(to, 0, f!);
    return next;
  });
}

export { printDataModel };
