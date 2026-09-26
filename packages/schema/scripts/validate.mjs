// プロジェクトファイルを検証する。引数が無ければ examples/*.project.{json,yaml} を対象にする。
import { readdirSync, readFileSync } from "node:fs";
import { relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { formatFromPath, formatIssue, loadProject } from "../dist/index.js";

const examplesDir = fileURLToPath(new URL("../examples/", import.meta.url));
const files =
  process.argv.length > 2
    ? process.argv.slice(2).map((f) => resolve(process.env.INIT_CWD ?? process.cwd(), f))
    : readdirSync(examplesDir)
        .filter((f) => /\.project\.(json|ya?ml)$/.test(f))
        .sort()
        .map((f) => resolve(examplesDir, f));

let failed = 0;
for (const file of files) {
  const name = relative(process.cwd(), file);
  try {
    const result = loadProject(readFileSync(file, "utf8"), formatFromPath(file));
    if (result.success) {
      console.log(`✓ ${name}`);
    } else {
      failed++;
      console.error(`✗ ${name}`);
      for (const issue of result.issues) console.error(`  ${formatIssue(issue)}`);
    }
  } catch (e) {
    failed++;
    console.error(`✗ ${name}\n  ${e instanceof Error ? e.message : String(e)}`);
  }
}
if (files.length === 0) console.error("検証するファイルがありません");
process.exit(failed > 0 || files.length === 0 ? 1 : 0);
