import { formatIssue, loadProject, type Project } from "@ui-editor/schema";
// 題材ファイルは packages/schema のものをそのまま読む（コピーしない）
import exampleJson from "../../../../packages/schema/examples/device-monitor.project.json?raw";

export const EXAMPLE_FILENAME = "device-monitor.project.json";

/** 題材アプリ（機器の設定＆モニタリング）のプロジェクト。 */
export function loadExampleProject(): Project {
  const result = loadProject(exampleJson, "json");
  if (!result.success) {
    throw new Error(
      `題材ファイルが検証を通りません:\n${result.issues.map(formatIssue).join("\n")}`,
    );
  }
  return result.project;
}
