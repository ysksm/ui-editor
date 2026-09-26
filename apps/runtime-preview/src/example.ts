import { loadProject, type Project } from "@ui-editor/schema";
// P0 の生成物をそのまま読む（@ui-editor/schema の exports に examples が無いため相対パス）
import exampleYaml from "../../../packages/schema/examples/device-monitor.project.yaml?raw";

export const EXAMPLE_FILE_NAME = "device-monitor.project.yaml";

/** 題材アプリのプロジェクトファイル。 */
export function loadExampleProject(): Project {
  const result = loadProject(exampleYaml, "yaml");
  if (!result.success) throw new Error("題材ファイルが検証を通りません");
  return result.project;
}
