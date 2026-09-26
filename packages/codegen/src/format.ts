import { format, type Options } from "prettier";

/**
 * 生成コードの Prettier 設定。リポジトリのルートと同じ。
 * 利用者の設定ファイルは読まない（どこで実行しても同じ出力にするため）。
 */
export const PRETTIER_OPTIONS = {
  semi: true,
  singleQuote: false,
  trailingComma: "all",
  printWidth: 100,
} as const satisfies Options;

/** ファイル名の拡張子からパーサーを選んで整形する。 */
export async function formatFile(path: string, content: string): Promise<string> {
  if (!/\.(tsx?|css|json|html|md)$/.test(path)) return content;
  return format(content, { ...PRETTIER_OPTIONS, filepath: path });
}
