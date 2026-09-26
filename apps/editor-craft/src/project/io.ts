import {
  formatFromPath,
  formatIssue,
  loadProject,
  serializeProject,
  validateProject,
  type Project,
  type ProjectFormat,
} from "@ui-editor/schema";

export type ImportResult = { ok: true; project: Project } | { ok: false; errors: string[] };

/** ファイルの中身を読み、検証したプロジェクトを返す。形式は拡張子で決める。 */
export function importProject(text: string, filename: string): ImportResult {
  try {
    const result = loadProject(text, formatFromPath(filename));
    if (!result.success) return { ok: false, errors: result.issues.map(formatIssue) };
    return { ok: true, project: result.project };
  } catch (e) {
    return { ok: false, errors: [(e as Error).message] };
  }
}

export interface ExportResult {
  filename: string;
  text: string;
  /** 検証の問題（あっても書き出しはする）。 */
  issues: string[];
}

/** P0 形式で書き出す（`serializeProject` なので決定的）。 */
export function exportProject(
  project: Project,
  format: ProjectFormat,
  baseName: string,
): ExportResult {
  const result = validateProject(project);
  return {
    filename: `${baseName}.${format}`,
    text: serializeProject(project, format),
    issues: result.success ? [] : result.issues.map(formatIssue),
  };
}

/** `device-monitor.project.yaml` → `device-monitor.project` */
export function baseNameOf(filename: string): string {
  return filename.replace(/\.(json|ya?ml)$/i, "");
}

export function downloadText(filename: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: "text/plain;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
