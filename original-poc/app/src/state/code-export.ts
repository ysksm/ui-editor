import type { Project } from "@ui-editor/poc-model";
import { zip } from "./zip";

/**
 * コードの書き出し（FR-GEN-05・architecture.md 4.12）。
 * File System Access API（showDirectoryPicker）があれば選んだフォルダに書き、無ければ zip をダウンロードする。
 * 生成（poc-codegen と Prettier）は大きいので、書き出すときだけ読み込む。
 */

export interface CodeFile {
  path: string;
  content: string;
}

export interface WritableDirectory {
  name: string;
  getDirectoryHandle(name: string, options?: { create?: boolean }): Promise<WritableDirectory>;
  getFileHandle(
    name: string,
    options?: { create?: boolean },
  ): Promise<{
    createWritable(): Promise<{ write(data: string): Promise<void>; close(): Promise<void> }>;
  }>;
  values?(): AsyncIterable<unknown>;
}

type DirectoryWindow = Window & {
  showDirectoryPicker?: (options?: {
    id?: string;
    mode?: "readwrite";
  }) => Promise<WritableDirectory>;
};

/** 生成できないとき（検証エラー・式の誤り）。problems に場所付きの理由。 */
export class CodeExportError extends Error {
  constructor(readonly problems: string[]) {
    super(problems.join("\n"));
  }
}

/** プロジェクトからコードを生成する。アプリ名はファイル名から作る。 */
export async function generateCode(
  project: Project,
  fileName: string | undefined,
): Promise<{ appName: string; files: CodeFile[] }> {
  const { appNameOf, generate, GenerateError } = await import("@ui-editor/poc-codegen");
  const appName = appNameOf(fileName);
  try {
    return { appName, files: await generate(project, { appName }) };
  } catch (e) {
    if (e instanceof GenerateError)
      throw new CodeExportError([e.message.split("\n")[0]!, ...e.problems]);
    throw e;
  }
}

/** 書き出すフォルダを選ぶ。API が無ければ undefined、キャンセルなら null。 */
export async function pickDirectory(): Promise<WritableDirectory | null | undefined> {
  const w = window as DirectoryWindow;
  if (!w.showDirectoryPicker) return undefined;
  try {
    return await w.showDirectoryPicker({ id: "poc-codegen", mode: "readwrite" });
  } catch {
    return null;
  }
}

/** フォルダが空か（調べられなければ空でないとみなす）。 */
export async function isEmptyDirectory(dir: WritableDirectory): Promise<boolean> {
  if (!dir.values) return false;
  for await (const _ of dir.values()) {
    void _;
    return false;
  }
  return true;
}

/** フォルダにファイルを書く（途中のフォルダは作る。ほかのファイルはそのまま）。 */
export async function writeToDirectory(dir: WritableDirectory, files: readonly CodeFile[]) {
  for (const f of files) {
    const parts = f.path.split("/");
    let d = dir;
    for (const p of parts.slice(0, -1)) d = await d.getDirectoryHandle(p, { create: true });
    const handle = await d.getFileHandle(parts.at(-1)!, { create: true });
    const writable = await handle.createWritable();
    await writable.write(f.content);
    await writable.close();
  }
}

/** `<アプリ名>.zip`（中身は `<アプリ名>/…`）をダウンロードする。 */
export function downloadZip(appName: string, files: readonly CodeFile[]): void {
  const bytes = zip(files.map((f) => ({ path: `${appName}/${f.path}`, content: f.content })));
  const url = URL.createObjectURL(new Blob([bytes], { type: "application/zip" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `${appName}.zip`;
  a.click();
  URL.revokeObjectURL(url);
}
