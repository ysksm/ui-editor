#!/usr/bin/env node
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { generate } from "./generate.js";
import { appNameFromPath } from "./names.js";
import { readProjectFile } from "./project-file.js";
import { writeFiles } from "./write.js";

const USAGE = `使い方: codegen <project-file> --out <dir> [--name <app-name>] [--clean]

  <project-file>  プロジェクトファイル（.json / .yaml）
  --out <dir>     出力先ディレクトリ
  --name <name>   生成するアプリのパッケージ名（省略時はファイル名から決める）
  --clean         書き出す前に出力先の src/ を消す`;

async function main(argv: string[]): Promise<number> {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      out: { type: "string" },
      name: { type: "string" },
      clean: { type: "boolean" },
      help: { type: "boolean", short: "h" },
    },
  });
  if (values.help) {
    console.log(USAGE);
    return 0;
  }
  const [input] = positionals;
  if (!input || !values.out || positionals.length > 1) {
    console.error(USAGE);
    return 1;
  }

  // pnpm 経由で実行されたときも、呼び出した場所からの相対パスとして扱う
  const cwd = process.env.INIT_CWD ?? process.cwd();
  const inputPath = resolve(cwd, input);
  const outDir = resolve(cwd, values.out);

  const project = readProjectFile(inputPath);
  const files = await generate(project, { appName: values.name ?? appNameFromPath(inputPath) });
  writeFiles(outDir, files, { clean: values.clean ?? false });
  console.log(`${files.length} ファイルを生成しました: ${outDir}`);
  return 0;
}

main(process.argv.slice(2)).then(
  (code) => process.exit(code),
  (e: unknown) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  },
);
