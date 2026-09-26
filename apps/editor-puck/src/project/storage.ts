import {
  formatIssue,
  loadProject,
  ProjectParseError,
  serializeProject,
  type Project,
  type ProjectFormat,
} from "@ui-editor/schema";
import exampleYaml from "../../../../packages/schema/examples/device-monitor.project.yaml?raw";

export type LoadResult = { ok: true; project: Project } | { ok: false; errors: string[] };

/** P0 のテキストを読み込んで検証する。 */
export function parseProject(text: string, format: ProjectFormat): LoadResult {
  try {
    const result = loadProject(text, format);
    if (result.success) return { ok: true, project: result.project };
    return { ok: false, errors: result.issues.map(formatIssue) };
  } catch (e) {
    if (e instanceof ProjectParseError) return { ok: false, errors: [e.message] };
    throw e;
  }
}

/** 題材ファイル（packages/schema/examples）を読み込む。 */
export function loadExample(): Project {
  const result = parseProject(exampleYaml, "yaml");
  if (!result.ok) throw new Error(`題材ファイルを読めません: ${result.errors.join("\n")}`);
  return result.project;
}

const STORAGE_KEY = "ui-editor/editor-puck/project";

/** ブラウザに保存した作業中のプロジェクト。無い・壊れている場合は undefined。 */
export function loadFromStorage(): Project | undefined {
  try {
    const text = localStorage.getItem(STORAGE_KEY);
    if (text === null) return undefined;
    const result = parseProject(text, "json");
    return result.ok ? result.project : undefined;
  } catch {
    return undefined;
  }
}

export function saveToStorage(project: Project): void {
  try {
    localStorage.setItem(STORAGE_KEY, serializeProject(project, "json"));
  } catch {
    // 保存できない環境（プライベートモードなど）では何もしない
  }
}

export function clearStorage(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // 同上
  }
}

/** プロジェクトを P0 形式のファイルとしてダウンロードさせる。 */
export function downloadProject(project: Project, format: ProjectFormat, baseName: string): void {
  const text = serializeProject(project, format);
  const type = format === "json" ? "application/json" : "application/yaml";
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `${baseName}.project.${format}`;
  a.click();
  URL.revokeObjectURL(url);
}
