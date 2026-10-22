/** 生成するコードの名前。 */

/** id（英字で始まり、英数字・_・- を含む）を PascalCase に（`device-detail` → `DeviceDetail`）。 */
export function pascalCase(id: string): string {
  return id
    .split(/[-_]+/)
    .filter(Boolean)
    .map((w) => w[0]!.toUpperCase() + w.slice(1))
    .join("");
}

/** id を camelCase に（`device-detail` → `deviceDetail`）。 */
export function camelCase(id: string): string {
  const p = pascalCase(id);
  return p.charAt(0).toLowerCase() + p.slice(1);
}

/** 名前をぶつからないように配る（2 つ目からは番号を付ける）。 */
export class NameTable {
  readonly #taken = new Set<string>();

  constructor(reserved: Iterable<string> = []) {
    for (const r of reserved) this.#taken.add(r);
  }

  take(base: string): string {
    let name = base;
    for (let n = 2; this.#taken.has(name); n++) name = `${base}${n}`;
    this.#taken.add(name);
    return name;
  }
}

const IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

/** オブジェクトのキー（識別子でなければ引用符で囲む）。 */
export function propKey(key: string): string {
  return IDENTIFIER.test(key) ? key : JSON.stringify(key);
}

/**
 * エンティティ id として使えない名前。エンティティの型は `src/model/types.ts` の中でだけ名前として使い、
 * ほかのファイルでは `Entities["Device"]` で参照するので、types.ts と records.ts で使う名前とだけぶつからなければよい。
 */
export const RESERVED_ENTITY_IDS: readonly string[] = [
  // types.ts で使う TS の型
  "Array",
  "Partial",
  "Readonly",
  "Record",
  // types.ts で宣言する型
  "DataView",
  "Dataset",
  "DialogName",
  "DialogParams",
  "Entities",
  "EntityFields",
  "EntityName",
  "FieldValue",
  "ScopeState",
  "ScreenName",
  "ScreenParams",
  "Selected",
  "UiState",
  "Values",
  // records.ts の関数（createRecord / updateRecords / deleteRecords）とぶつかる
  "Records",
];

/** JS の値をソースコードのリテラルにする（キーは識別子なら引用符なし）。整形は Prettier に任せる。 */
export function literal(value: unknown): string {
  if (value === undefined) return "undefined";
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(literal).join(", ")}]`;
  const entries = Object.entries(value).filter(([, v]) => v !== undefined);
  return `{ ${entries.map(([k, v]) => `${propKey(k)}: ${literal(v)}`).join(", ")} }`;
}
