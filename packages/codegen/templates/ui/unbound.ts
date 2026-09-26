/**
 * まだ変換していないバインディング（`{{ 式 }}`）の仮置き。
 * テンプレートの文字列をそのまま返す。どの型の場所にも置けるよう never にしている。
 */
export function unbound(template: string): never {
  return template as never;
}
