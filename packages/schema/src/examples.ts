import { sampleData } from "./domain/sample-data.js";
import { parseProjectText } from "./project/io.js";
import type { Project } from "./project/schema.js";
import { formatIssue, validateProject } from "./project/validate.js";

/** 題材アプリの手書きの元ファイルと、そこから生成するファイル（examples/ からの相対）。 */
export const DEVICE_MONITOR_EXAMPLE = {
  source: "device-monitor.source.yaml",
  outputs: { yaml: "device-monitor.project.yaml", json: "device-monitor.project.json" },
} as const;

/** 手書きの元ファイルに #4 のサンプルデータを入れ、検証したプロジェクトを返す。 */
export function buildDeviceMonitorProject(sourceYaml: string): Project {
  const raw = parseProjectText(sourceYaml, "yaml") as Record<string, unknown>;
  const result = validateProject({ ...raw, sampleData });
  if (!result.success) {
    throw new Error(
      `題材ファイルが検証を通りません:\n${result.issues.map(formatIssue).join("\n")}`,
    );
  }
  return result.project;
}
