/** 生成するファイル。path は出力先ディレクトリからの相対パス（区切りは `/`）。 */
export interface GeneratedFile {
  path: string;
  content: string;
}

/** ファイルを集めるための入れ物。同じパスを 2 回書くとエラーにする。 */
export class FileSet {
  readonly #files = new Map<string, string>();

  add(path: string, content: string): void {
    if (this.#files.has(path)) throw new Error(`同じパスのファイルを 2 回生成しました: ${path}`);
    this.#files.set(path, content);
  }

  /** パスの順に並べて返す。 */
  toArray(): GeneratedFile[] {
    return [...this.#files]
      .map(([path, content]) => ({ path, content }))
      .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  }
}
