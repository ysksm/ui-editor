/** 1 ファイル分の import 文を集めて、決まった順に書き出す。 */
export class Imports {
  readonly #values = new Map<string, Set<string>>();
  readonly #types = new Map<string, Set<string>>();
  readonly #defaults = new Map<string, string>();

  /** `import { name } from "from"` */
  value(from: string, ...names: string[]): this {
    add(this.#values, from, names);
    return this;
  }

  /** `import type { name } from "from"` */
  type(from: string, ...names: string[]): this {
    add(this.#types, from, names);
    return this;
  }

  /** `import name from "from"` */
  default(from: string, name: string): this {
    this.#defaults.set(from, name);
    return this;
  }

  /** 外部パッケージ → 相対パスの順、それぞれアルファベット順。 */
  toString(): string {
    const modules = [
      ...new Set([...this.#values.keys(), ...this.#types.keys(), ...this.#defaults.keys()]),
    ].sort(compareModules);
    const lines: string[] = [];
    for (const from of modules) {
      const def = this.#defaults.get(from);
      const values = [...(this.#values.get(from) ?? [])].sort();
      const types = [...(this.#types.get(from) ?? [])].filter((t) => !values.includes(t)).sort();
      const named = [...values, ...types.map((t) => `type ${t}`)];
      if (def && named.length > 0)
        lines.push(`import ${def}, { ${named.join(", ")} } from "${from}";`);
      else if (def) lines.push(`import ${def} from "${from}";`);
      else if (values.length === 0 && types.length > 0)
        lines.push(`import type { ${types.join(", ")} } from "${from}";`);
      else if (named.length > 0) lines.push(`import { ${named.join(", ")} } from "${from}";`);
    }
    return lines.length > 0 ? `${lines.join("\n")}\n\n` : "";
  }
}

function add(map: Map<string, Set<string>>, from: string, names: string[]) {
  const set = map.get(from) ?? new Set<string>();
  for (const n of names) set.add(n);
  map.set(from, set);
}

function compareModules(a: string, b: string): number {
  const ra = a.startsWith(".") ? 1 : 0;
  const rb = b.startsWith(".") ? 1 : 0;
  if (ra !== rb) return ra - rb;
  return a < b ? -1 : a > b ? 1 : 0;
}
