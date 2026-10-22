// templates/ の固定のファイルを、文字列の定数にして src/templates.generated.ts に書く。
// 生成はブラウザでも動かすので、実行時にファイルを読まずに済むようにする（architecture.md 4.12）。
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { format } from "prettier";

const root = fileURLToPath(new URL("../templates/", import.meta.url));
const out = fileURLToPath(new URL("../src/templates.generated.ts", import.meta.url));

function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((d) =>
    d.isDirectory() ? walk(join(dir, d.name)) : [join(dir, d.name)],
  );
}

const entries = walk(root)
  .map((file) => [relative(root, file).split(sep).join("/"), readFileSync(file, "utf8")])
  .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));

const source = `// pnpm --filter @ui-editor/poc-codegen embed で templates/ から作るファイル。手で書き換えない。

/** 生成アプリに入れる固定のファイル（パス → 中身）。 */
export const TEMPLATES: Readonly<Record<string, string>> = {
${entries.map(([path, content]) => `  ${JSON.stringify(path)}: ${JSON.stringify(content)},`).join("\n")}
};
`;
writeFileSync(out, await format(source, { filepath: out }));
console.log(`${entries.length} ファイル → ${relative(process.cwd(), out)}`);
