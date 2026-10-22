import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { formatIssue, generateScreens, loadProject, type Project } from "@ui-editor/poc-model";
import type { GeneratedFile } from "./files.js";

/** Node だけで使うもの（ファイルの読み書き）。ブラウザからは `@ui-editor/poc-codegen` を使う。 */

const EXAMPLE_FILE = fileURLToPath(
  new URL("../../../examples/device-monitor.poc.json", import.meta.url),
);

/**
 * 生成を確かめる題材。
 * - device-monitor: original-poc/examples の題材（手で組んだ画面）
 * - device-monitor-generated: 題材の ER とデータから、ER からの生成（generateScreens）で全エンティティの画面を作ったもの
 */
export const EXAMPLES: readonly { name: string; load: () => Project }[] = [
  { name: "device-monitor", load: () => readProjectFile(EXAMPLE_FILE) },
  { name: "device-monitor-generated", load: () => generatedExample(readProjectFile(EXAMPLE_FILE)) },
];

/** ER からの生成で、全エンティティ（親から順）の一覧・詳細・フォーム・削除の確認を作る。 */
export function generatedExample(base: Project): Project {
  const project: Project = { ...structuredClone(base), entry: undefined, screens: [], dialogs: [] };
  delete project.layout;
  for (const e of base.entities) generateScreens(project, e.id);
  return project;
}

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
