import { readFileSync } from "node:fs";
import { loadProject, type Project } from "@ui-editor/schema";

/** 題材アプリのプロジェクトファイル（P0 の生成物）を読み込む。 */
export function exampleProject(): Project {
  const url = new URL("../../schema/examples/device-monitor.project.yaml", import.meta.url);
  const result = loadProject(readFileSync(url, "utf8"), "yaml");
  if (!result.success) throw new Error("題材ファイルを読み込めません");
  return result.project;
}
