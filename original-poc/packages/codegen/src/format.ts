import * as babel from "prettier/plugins/babel";
import * as estree from "prettier/plugins/estree";
import * as postcss from "prettier/plugins/postcss";
import * as typescript from "prettier/plugins/typescript";
import type { Options } from "prettier";
import { format } from "prettier/standalone";

/**
 * 生成コードの Prettier の設定（リポジトリのルートと同じ）。利用者の設定ファイルは読まない。
 * CLI とブラウザで同じ出力にするため、prettier/standalone とプラグインを使う（architecture.md 4.12）。
 */
export const PRETTIER_OPTIONS = {
  semi: true,
  singleQuote: false,
  trailingComma: "all",
  printWidth: 100,
} as const satisfies Options;

const PARSERS: Record<string, string> = {
  ts: "typescript",
  tsx: "typescript",
  json: "json",
  css: "css",
};

/** 拡張子でパーサーを選んで整形する（HTML・Markdown などはそのまま）。 */
export async function formatFile(path: string, content: string): Promise<string> {
  const parser = PARSERS[path.slice(path.lastIndexOf(".") + 1)];
  if (!parser) return content;
  return format(content, {
    ...PRETTIER_OPTIONS,
    parser,
    plugins: [babel, estree, postcss, typescript],
  });
}
