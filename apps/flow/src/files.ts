import {
  formatFromPath,
  formatIssue,
  loadProject,
  serializeProject,
  type Project,
  type ProjectFormat,
} from "@ui-editor/schema";

/**
 * プロジェクトファイルの読み書き。
 * File System Access API（Chrome / Edge）があれば開いたファイルにそのまま上書き保存し、
 * 無ければ `<input type="file">` とダウンロードで代用する。
 */

interface FileHandle {
  name: string;
  getFile(): Promise<File>;
  createWritable(): Promise<{ write(text: string): Promise<void>; close(): Promise<void> }>;
}

interface PickerOptions {
  suggestedName?: string;
  types?: { description: string; accept: Record<string, string[]> }[];
}

type FsWindow = Window & {
  showOpenFilePicker?: (options?: PickerOptions) => Promise<FileHandle[]>;
  showSaveFilePicker?: (options?: PickerOptions) => Promise<FileHandle>;
};

const PROJECT_TYPES = [
  {
    description: "プロジェクトファイル（P0 形式）",
    accept: { "application/json": [".json"], "application/yaml": [".yaml", ".yml"] },
  },
];

export interface LoadedProject {
  /** 配置ファイルの名前（プロジェクトファイル名から拡張子を除いたもの） */
  name: string;
  fileName: string;
  format: ProjectFormat;
  project: Project;
  /** 上書き保存先（File System Access API で開いたとき） */
  handle?: FileHandle | undefined;
}

export function parseProjectFile(fileName: string, text: string): LoadedProject {
  const format = formatFromPath(fileName);
  const result = loadProject(text, format);
  if (!result.success) throw new Error(result.issues.map(formatIssue).join("\n"));
  const name = fileName
    .replace(/^.*[\\/]/, "")
    .replace(/(\.project)?\.(json|ya?ml)$/i, "")
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-");
  return { name, fileName, format, project: result.project };
}

/** ファイルを選んで読み込む。キャンセルされたら undefined。 */
export async function openProjectFile(): Promise<LoadedProject | undefined> {
  const w = window as FsWindow;
  if (w.showOpenFilePicker) {
    let handle: FileHandle | undefined;
    try {
      [handle] = await w.showOpenFilePicker({ types: PROJECT_TYPES });
    } catch {
      return undefined; // キャンセル
    }
    if (!handle) return undefined;
    const file = await handle.getFile();
    return { ...parseProjectFile(file.name, await file.text()), handle };
  }
  const file = await pickWithInput();
  return file && parseProjectFile(file.name, await file.text());
}

/** P0 形式で保存する。保存先の説明を返す（キャンセルなら undefined）。 */
export async function saveProjectFile(
  loaded: LoadedProject,
  project: Project,
): Promise<{ message: string; handle?: FileHandle | undefined } | undefined> {
  const w = window as FsWindow;
  let handle = loaded.handle;
  if (!handle && w.showSaveFilePicker) {
    try {
      handle = await w.showSaveFilePicker({
        suggestedName: loaded.fileName,
        types: PROJECT_TYPES,
      });
    } catch {
      return undefined; // キャンセル
    }
  }
  const format = handle ? formatFromPath(handle.name) : loaded.format;
  const text = serializeProject(project, format);
  if (handle) {
    const writable = await handle.createWritable();
    await writable.write(text);
    await writable.close();
    return { message: `${handle.name} に保存しました`, handle };
  }
  download(loaded.fileName, text);
  return { message: `${loaded.fileName} をダウンロードしました` };
}

export function download(fileName: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}

function pickWithInput(): Promise<File | undefined> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json,.yaml,.yml";
    input.onchange = () => resolve(input.files?.[0]);
    input.oncancel = () => resolve(undefined);
    input.click();
  });
}
