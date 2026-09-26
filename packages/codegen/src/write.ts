import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { GeneratedFile } from "./files.js";

export interface WriteOptions {
  /** 書き出す前に出力先の `src/` を消す（消えたファイルが残らないように）。 */
  clean?: boolean;
}

/** 生成したファイルを出力先に書き出す。node_modules などそれ以外のファイルには触らない。 */
export function writeFiles(outDir: string, files: GeneratedFile[], options: WriteOptions = {}) {
  if (options.clean) rmSync(join(outDir, "src"), { recursive: true, force: true });
  for (const file of files) {
    const path = join(outDir, file.path);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, file.content);
  }
}
