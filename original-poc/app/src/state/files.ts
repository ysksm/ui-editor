import { formatIssue, loadProject, serializeProject, type Project } from "@ui-editor/poc-model";

/**
 * プロジェクトファイルの読み書き（architecture.md 4.14）。
 * File System Access API（Chrome / Edge）があれば開いたファイルにそのまま上書き保存し、
 * 無ければ `<input type="file">` とダウンロードで代用する。
 */

export interface FileHandle {
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
  { description: "プロジェクトファイル（poc-0）", accept: { "application/json": [".json"] } },
];

export const DEFAULT_FILE_NAME = "project.poc.json";

export interface OpenedFile {
  name: string;
  text: string;
  handle?: FileHandle | undefined;
}

/** テキストを読み込む。形が壊れていれば問題を並べた Error を投げる。 */
export function parseProjectFile(text: string): Project {
  const result = loadProject(text);
  if (!result.success) throw new Error(result.issues.map(formatIssue).join("\n"));
  return result.project;
}

/** ファイルを選んで読む。キャンセルされたら undefined。 */
export async function openProjectFile(): Promise<OpenedFile | undefined> {
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
    return { name: file.name, text: await file.text(), handle };
  }
  const file = await pickWithInput();
  return file && { name: file.name, text: await file.text() };
}

/**
 * 保存する。`saveAs` か保存先が無ければ保存先を選ぶ（API が無ければダウンロード）。
 * 保存したファイルの情報を返す（キャンセルなら undefined）。
 */
export async function saveProjectFile(
  project: Project,
  current: { name: string; handle?: FileHandle | undefined } | null,
  saveAs: boolean,
): Promise<{ name: string; handle?: FileHandle | undefined; downloaded: boolean } | undefined> {
  const w = window as FsWindow;
  const text = serializeProject(project);
  let handle = saveAs ? undefined : current?.handle;
  if (!handle && w.showSaveFilePicker) {
    try {
      handle = await w.showSaveFilePicker({
        suggestedName: current?.name ?? DEFAULT_FILE_NAME,
        types: PROJECT_TYPES,
      });
    } catch {
      return undefined; // キャンセル
    }
  }
  if (handle) {
    const writable = await handle.createWritable();
    await writable.write(text);
    await writable.close();
    return { name: handle.name, handle, downloaded: false };
  }
  const name = current?.name ?? DEFAULT_FILE_NAME;
  download(name, text);
  return { name, downloaded: true };
}

export function download(fileName: string, text: string, type = "application/json"): void {
  const url = URL.createObjectURL(new Blob([text], { type }));
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
    input.accept = ".json";
    input.onchange = () => resolve(input.files?.[0]);
    input.oncancel = () => resolve(undefined);
    input.click();
  });
}
