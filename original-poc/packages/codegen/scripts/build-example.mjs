// 題材から生成したアプリを out/<name> に書き出し、ワークスペースの外のアプリとしてインストールしてビルドする
// （tsc の型検査と vite build）。ネットワークを使うので pnpm test には入れない。
// 例: pnpm --filter @ui-editor/poc-codegen build:example
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { generate } from "../dist/index.js";
import { EXAMPLES, readProjectFile, writeFiles } from "../dist/node.js";

for (const example of EXAMPLES) {
  const outDir = fileURLToPath(new URL(`../out/${example.name}/`, import.meta.url));
  const files = await generate(readProjectFile(example.file), { appName: example.name });
  writeFiles(outDir, files, { clean: true });
  console.log(`=== ${example.name}: ${files.length} ファイル → ${outDir}`);
  const run = (...args) => execFileSync("pnpm", args, { cwd: outDir, stdio: "inherit" });
  run("install", "--ignore-workspace", "--reporter=append-only");
  run("run", "build");
}
