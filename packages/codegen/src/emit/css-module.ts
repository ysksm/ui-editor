import { camelCase } from "../names.js";
import { cssRule, type StyleEntry } from "./css.js";

/** 1 ファイル分の CSS Modules。ノード id からクラス名を決める。 */
export class CssModule {
  readonly #rules: string[] = [];
  readonly #used = new Set<string>();

  /** クラスを追加してクラス名を返す。名前が重なったら番号を付ける。 */
  add(nodeId: string, entries: StyleEntry[]): string {
    const base = camelCase(nodeId) || "node";
    let name = base;
    for (let i = 2; this.#used.has(name); i++) name = `${base}${i}`;
    this.#used.add(name);
    this.#rules.push(cssRule(name, entries));
    return name;
  }

  get isEmpty(): boolean {
    return this.#rules.length === 0;
  }

  toString(): string {
    return this.#rules.join("\n");
  }
}
