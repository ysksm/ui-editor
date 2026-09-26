// 題材から生成したアプリを out/<name> に書き出し、依存をインストールしてビルドする。
// 引数で題材の名前を渡すとその題材だけを対象にする。例: node scripts/build-examples.mjs hello
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { EXAMPLES, generate, readProjectFile, writeFiles } from "../dist/index.js";

const names = process.argv.slice(2);
const targets = names.length > 0 ? EXAMPLES.filter((e) => names.includes(e.name)) : EXAMPLES;
if (targets.length === 0) {
  console.error(`題材がありません: ${names.join(", ")}`);
  process.exit(1);
}

for (const example of targets) {
  const outDir = fileURLToPath(new URL(`../out/${example.name}/`, import.meta.url));
  const files = await generate(readProjectFile(example.file), { appName: example.name });
  writeFiles(outDir, files, { clean: true });
  console.log(`\n=== ${example.name}: ${files.length} ファイル → ${outDir}`);
  // リポジトリの workspace には入れず、生成したアプリ単体としてインストールする
  const run = (...args) => execFileSync("pnpm", args, { cwd: outDir, stdio: "inherit" });
  run("install", "--ignore-workspace", "--reporter=silent");
  run("build");
}
