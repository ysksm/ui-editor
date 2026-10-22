/** import 文を集める（モジュールの順・名前の順に並べて書く）。 */
export class Imports {
  readonly #values = new Map<string, Set<string>>();
  readonly #types = new Map<string, Set<string>>();

  value(module: string, ...names: string[]): this {
    const set = this.#values.get(module) ?? new Set<string>();
    for (const n of names) set.add(n);
    this.#values.set(module, set);
    return this;
  }

  type(module: string, ...names: string[]): this {
    const set = this.#types.get(module) ?? new Set<string>();
    for (const n of names) set.add(n);
    this.#types.set(module, set);
    return this;
  }

  toString(): string {
    const modules = [...new Set([...this.#values.keys(), ...this.#types.keys()])].sort(
      (a, b) => order(a) - order(b) || (a < b ? -1 : a > b ? 1 : 0),
    );
    return modules
      .flatMap((m) => {
        const lines: string[] = [];
        const values = [...(this.#values.get(m) ?? [])].sort();
        const types = [...(this.#types.get(m) ?? [])].filter((t) => !values.includes(t)).sort();
        if (values.length > 0) lines.push(`import { ${values.join(", ")} } from "${m}";`);
        if (types.length > 0) lines.push(`import type { ${types.join(", ")} } from "${m}";`);
        return lines;
      })
      .join("\n");
  }
}

/** 外部のパッケージ → 上のフォルダ → 同じフォルダ。 */
function order(module: string): number {
  if (module.startsWith("../")) return 1;
  if (module.startsWith("./")) return 2;
  return 0;
}
