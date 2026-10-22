// 題材から生成したアプリを out/<name> に書き出し、ワークスペースの外のアプリとしてインストールしてビルドする
// （tsc の型検査と vite build）。ネットワークを使うので pnpm test には入れない。
// 例: pnpm --filter @ui-editor/poc-codegen build:example（題材の名前を渡すとその題材だけ）
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { generate } from "../dist/index.js";
import { EXAMPLES, writeFiles } from "../dist/node.js";

const names = process.argv.slice(2);
for (const example of EXAMPLES.filter((e) => names.length === 0 || names.includes(e.name))) {
  const outDir = fileURLToPath(new URL(`../out/${example.name}/`, import.meta.url));
  const files = await generate(example.load(), { appName: example.name });
  writeFiles(outDir, files, { clean: true });
  console.log(`=== ${example.name}: ${files.length} ファイル → ${outDir}`);
  const run = (...args) => execFileSync("pnpm", args, { cwd: outDir, stdio: "inherit" });
  run("install", "--ignore-workspace", "--reporter=append-only");
  run("run", "build");
}
