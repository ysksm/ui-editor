import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { formatIssue, loadProject, type Project } from "@ui-editor/poc-model";
import type { GeneratedFile } from "./files.js";

/** Node だけで使うもの（ファイルの読み書き）。ブラウザからは `@ui-editor/poc-codegen` を使う。 */

/** 題材（original-poc/examples）。 */
export const EXAMPLES = [
  {
    name: "device-monitor",
    file: fileURLToPath(new URL("../../../examples/device-monitor.poc.json", import.meta.url)),
  },
] as const;

/** プロジェクトファイルを読む（形・参照のエラーがあれば例外）。 */
export function readProjectFile(path: string): Project {
  const result = loadProject(readFileSync(path, "utf8"));
  if (!result.success)
    throw new Error(`${path} を読めません:\n${result.issues.map(formatIssue).join("\n")}`);
  return result.project;
}

/** 消さずに残すもの（インストールし直さないため）。 */
const KEEP = new Set(["node_modules", "pnpm-lock.yaml"]);

/** 生成したファイルをフォルダに書く。clean なら先にフォルダの中身を消す（node_modules とロックファイルは残す）。 */
export function writeFiles(
  outDir: string,
  files: readonly GeneratedFile[],
  options: { clean?: boolean } = {},
): void {
  if (options.clean && existsSync(outDir)) {
    for (const entry of readdirSync(outDir))
      if (!KEEP.has(entry)) rmSync(join(outDir, entry), { recursive: true, force: true });
  }
  for (const f of files) {
    const path = join(outDir, ...f.path.split("/"));
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, f.content);
  }
}
