import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { loadProject, type Project } from "@ui-editor/schema";

/** 題材ファイル（P0-4 の生成物）を読み込む。 */
export function loadExample(): Project {
  const url = new URL(
    "../../../../packages/schema/examples/device-monitor.project.json",
    import.meta.url,
  );
  const result = loadProject(readFileSync(fileURLToPath(url), "utf8"), "json");
  if (!result.success) throw new Error("題材ファイルが読めません");
  return result.project;
}
