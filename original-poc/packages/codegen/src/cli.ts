#!/usr/bin/env node
import { basename, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { generate, GenerateError } from "./generate.js";
import { appNameOf } from "./names.js";
import { readProjectFile, writeFiles } from "./node.js";

const USAGE = `使い方: poc-codegen <project.poc.json> [--out <フォルダ>] [--name <アプリ名>] [--clean]

  --out    書き出すフォルダ（既定: ファイル名から .poc.json を除いた名前）
  --name   package.json の name（既定: ファイル名から作る）
  --clean  書き出す前にフォルダの中身を消す（node_modules とロックファイルは残す）`;

/** CLI の本体。終了コードを返す。 */
export async function main(argv: readonly string[], log = console.log, error = console.error) {
  const args = [...argv];
  const take = (flag: string) => {
    const i = args.indexOf(flag);
    if (i < 0) return undefined;
    const [, v] = args.splice(i, 2);
    return v;
  };
  const clean = args.includes("--clean");
  if (clean) args.splice(args.indexOf("--clean"), 1);
  const out = take("--out");
  const name = take("--name");
  const [file, ...rest] = args;
  if (!file || rest.length > 0 || args.some((a) => a.startsWith("--"))) {
    error(USAGE);
    return 2;
  }
  const appName = name ?? appNameOf(basename(file));
  const outDir = resolve(out ?? appName);
  try {
    const files = await generate(readProjectFile(file), { appName });
    writeFiles(outDir, files, { clean });
    log(`${files.length} ファイルを ${outDir} に書き出しました。`);
    log(`動かす: cd ${outDir} && pnpm install && pnpm dev`);
    return 0;
  } catch (e) {
    error(e instanceof GenerateError || e instanceof Error ? e.message : String(e));
    return 1;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await main(process.argv.slice(2));
}
