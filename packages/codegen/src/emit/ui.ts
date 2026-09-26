import { readFileSync } from "node:fs";
import type { FileSet } from "../files.js";

const TEMPLATES = new URL("../../templates/ui/", import.meta.url);

/**
 * 組み込みの部品（templates/ui/）のうち、使ったものを src/ui/ に書き出す。
 * 生成コードから読みやすいよう、組み込みの type は手書きの小さな部品にしてある。
 */
export function writeUi(files: FileSet, used: ReadonlySet<string>) {
  const names = [...used].sort();
  for (const name of names) {
    const file = name === "unbound" ? "unbound.ts" : `${name}.tsx`;
    files.add(`src/ui/${file}`, readFileSync(new URL(file, TEMPLATES), "utf8"));
  }
  if (names.some((n) => n !== "unbound")) {
    files.add("src/ui/ui.module.css", readFileSync(new URL("ui.module.css", TEMPLATES), "utf8"));
  }
}
