import { open, save } from "@tauri-apps/plugin-dialog";
import { readTextFile, writeTextFile } from "@tauri-apps/plugin-fs";

/** ローカルのプロジェクトファイルの読み書き（テストでは差し替える）。 */
export interface LocalFiles {
  /** ファイルダイアログで選んだファイルを読む。キャンセルなら undefined。 */
  open(): Promise<{ path: string; text: string } | undefined>;
  /** 保存先をダイアログで選んで書く。キャンセルなら undefined。 */
  saveAs(defaultPath: string, text: string): Promise<string | undefined>;
  /** 決まったパスに書く（上書き保存）。 */
  write(path: string, text: string): Promise<void>;
}

const FILTERS = [{ name: "プロジェクトファイル", extensions: ["json", "yaml", "yml"] }];

/** Tauri のダイアログと fs プラグインを使う実装。ダイアログで選んだパスは fs の許可範囲に入る。 */
export const tauriFiles: LocalFiles = {
  async open() {
    const path = await open({ multiple: false, directory: false, filters: FILTERS });
    if (!path) return undefined;
    return { path, text: await readTextFile(path) };
  },
  async saveAs(defaultPath, text) {
    const path = await save({ defaultPath, filters: FILTERS });
    if (!path) return undefined;
    await writeTextFile(path, text);
    return path;
  },
  write: (path, text) => writeTextFile(path, text),
};

/** `/a/b/device-monitor.project.json` → `device-monitor.project.json`（Windows の区切りも扱う） */
export function fileNameOf(path: string): string {
  return path.split(/[\\/]/).pop() ?? path;
}

/** `/a/b/x.json` と `x.yaml` → `/a/b/x.yaml`（保存ダイアログの初期値） */
export function siblingPath(path: string | undefined, filename: string): string {
  if (!path) return filename;
  return path.slice(0, path.length - fileNameOf(path).length) + filename;
}
