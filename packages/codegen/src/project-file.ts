import { readFileSync } from "node:fs";
import { formatFromPath, formatIssue, loadProject, type Project } from "@ui-editor/schema";

/** プロジェクトファイルを読み込んで検証する。問題があれば内容を並べたエラーにする。 */
export function readProjectFile(path: string): Project {
  const result = loadProject(readFileSync(path, "utf8"), formatFromPath(path));
  if (!result.success) {
    throw new Error(
      `プロジェクトファイルが検証を通りません: ${path}\n` +
        result.issues.map((i) => `  ${formatIssue(i)}`).join("\n"),
    );
  }
  return result.project;
}
