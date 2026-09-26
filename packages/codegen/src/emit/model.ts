import type { Project } from "@ui-editor/schema";

const DECLARATION =
  /^(?:export\s+)?(?:declare\s+)?(?:interface|type|enum|const\s+enum)\s+([A-Za-z_$][\w$]*)/gm;

/** dataModel.source で宣言されている型の名前（書かれた順）。 */
export function modelTypeNames(project: Project): string[] {
  return [...project.dataModel.source.matchAll(DECLARATION)].map((m) => m[1]!);
}

/** dataModel.source の先頭レベルの宣言に export を付けたもの。宣言がなければ undefined。 */
export function modelSource(project: Project): string | undefined {
  if (modelTypeNames(project).length === 0) return undefined;
  const body = project.dataModel.source.replace(
    /^(?!export\s)((?:declare\s+)?(?:interface|type|enum|const\s+enum)\s)/gm,
    "export $1",
  );
  return `// データモデル（プロジェクトファイルの dataModel.source）\n\n${body}`;
}

/** 型の式に出てくるデータモデルの型名（アルファベット順）。 */
export function referencedModelTypes(typeExpr: string, modelTypes: readonly string[]): string[] {
  const words = new Set(typeExpr.match(/[A-Za-z_$][\w$]*/g) ?? []);
  return modelTypes.filter((t) => words.has(t)).sort();
}
