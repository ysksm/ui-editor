import { checkProject, formatIssue, type Project } from "@ui-editor/poc-model";
import { emitAppFiles, emitPlaceholderApp } from "./emit/app.js";
import { emitData, emitSchema, emitTypes } from "./emit/model.js";
import { emitRecords } from "./emit/records.js";
import { FileSet, type GeneratedFile } from "./files.js";
import { formatFile } from "./format.js";
import { RESERVED_ENTITY_IDS } from "./names.js";
import { TEMPLATES } from "./templates.generated.js";

export interface GenerateOptions {
  /** 生成するアプリの package.json の name（既定 `poc-app`）。 */
  appName?: string;
}

/** 生成できないとき（プロジェクトのエラー・使えない名前）。`problems` に場所付きの理由を入れる。 */
export class GenerateError extends Error {
  constructor(
    message: string,
    readonly problems: string[],
  ) {
    super(`${message}\n${problems.map((p) => `- ${p}`).join("\n")}`);
    this.name = "GenerateError";
  }
}

/**
 * poc-0 のプロジェクトから Vite + React + TS のアプリを生成する（architecture.md 4.12）。
 * ファイルは読み書きせず、整形したファイルの一覧（パスの順）を返す。同じ入力なら同じ出力。
 */
export async function generate(
  project: Project,
  options: GenerateOptions = {},
): Promise<GeneratedFile[]> {
  const errors = checkProject(project).filter((i) => i.severity === "error");
  if (errors.length > 0)
    throw new GenerateError(
      "プロジェクトにエラーがあるので生成できません",
      errors.map(formatIssue),
    );
  const reserved = project.entities.filter((e) => RESERVED_ENTITY_IDS.includes(e.id));
  if (reserved.length > 0)
    throw new GenerateError(
      "生成するコードの名前とぶつかるエンティティ id があります（ER ビューで id を変えてください）",
      reserved.map((e) => `エンティティ "${e.id}"（${e.name}）`),
    );

  const files = new FileSet();
  emitAppFiles(files, project, options.appName ?? "poc-app");
  for (const [path, content] of Object.entries(TEMPLATES)) files.add(path, content);
  files.add("src/model/types.ts", emitTypes(project));
  files.add("src/model/schema.ts", emitSchema(project));
  files.add("src/model/data.ts", emitData(project));
  files.add("src/store/records.ts", emitRecords(project));
  files.add("src/App.tsx", emitPlaceholderApp(project));

  return Promise.all(
    files
      .toArray()
      .map(async (f) => ({ path: f.path, content: await formatFile(f.path, f.content) })),
  );
}
