import {
  formatFromPath,
  formatIssue,
  loadProject,
  serializeProject,
  validateProject,
  type Project,
  type ProjectFormat,
} from "@ui-editor/schema";

export type FileResult<T> = { ok: true; value: T } | { ok: false; errors: string[] };

/** 検証してから P0 形式のテキストに書き出す。 */
export function projectToText(project: Project, format: ProjectFormat): FileResult<string> {
  const result = validateProject(project);
  if (!result.success) return { ok: false, errors: result.issues.map(formatIssue) };
  return { ok: true, value: serializeProject(result.project, format) };
}

/** P0 形式のファイル（.json / .yaml）を読み込む。 */
export function projectFromText(text: string, fileName: string): FileResult<Project> {
  try {
    const result = loadProject(text, formatFromPath(fileName));
    if (!result.success) return { ok: false, errors: result.issues.map(formatIssue) };
    return { ok: true, value: result.project };
  } catch (e) {
    return { ok: false, errors: [e instanceof Error ? e.message : String(e)] };
  }
}

/** 開いたファイル名の拡張子を、保存する形式のものに付け替える。 */
export function fileNameFor(fileName: string, format: ProjectFormat): string {
  return `${fileName.replace(/\.(json|ya?ml)$/i, "")}.${format}`;
}

export function downloadText(text: string, fileName: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: "text/plain;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}
