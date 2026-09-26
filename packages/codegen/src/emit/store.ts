import type { Project } from "@ui-editor/schema";
import type { FileSet } from "../files.js";
import { dialogName, pascalCase } from "../names.js";
import { referencedModelTypes } from "./model.js";

/**
 * コレクション名 → レコードの型名。スキーマには対応が書かれていないので名前から推測する。
 * `deviceSettings` → `DeviceSettings`（そのままの名前）、`devices` → `Device`（単数形）。
 */
export function collectionType(
  collection: string,
  modelTypes: readonly string[],
): string | undefined {
  const pascal = pascalCase(collection);
  const candidates = [
    pascal,
    pascal.replace(/ies$/, "y"),
    pascal.replace(/(s|x|ch|sh)es$/, "$1"),
    pascal.replace(/s$/, ""),
  ];
  return candidates.find((c) => modelTypes.includes(c));
}

/** src/store/sampleData.ts と src/store/appStore.ts を書き出す。 */
export function writeStore(files: FileSet, project: Project, modelTypes: readonly string[]) {
  const collections = Object.keys(project.sampleData);
  const dataFields = collections.map((c) => {
    const type = collectionType(c, modelTypes);
    return type
      ? `  ${c}: ${type}[];\n`
      : `  // データモデルに対応する型が見つからない\n  ${c}: Record<string, unknown>[];\n`;
  });
  const dataTypes = collections
    .map((c) => collectionType(c, modelTypes))
    .filter((t): t is string => t !== undefined)
    .sort();
  files.add(
    "src/store/sampleData.ts",
    `${dataTypes.length > 0 ? `import type { ${dataTypes.join(", ")} } from "../model";\n\n` : ""}/** データ（\`{{ data.xxx }}\`）。コレクション名 → レコードの配列。 */
export interface Data {
${dataFields.join("")}}

/** サンプルデータ（プロジェクトファイルの sampleData）。 */
export const sampleData: Data = ${JSON.stringify(project.sampleData, null, 2)};
`,
  );

  const state = Object.entries(project.state ?? {});
  const dialogs = project.dialogs ?? [];
  const dialogImports = dialogs
    .filter((d) => Object.keys(d.params ?? {}).length > 0)
    .map((d) => dialogName(d.id))
    .sort()
    .map((n) => `import type { ${n}Params } from "../dialogs/${n}";\n`)
    .join("");
  const openDialogType = dialogs
    .map((d) =>
      Object.keys(d.params ?? {}).length > 0
        ? `  | { id: ${JSON.stringify(d.id)}; params: ${dialogName(d.id)}Params }\n`
        : `  | { id: ${JSON.stringify(d.id)} }\n`,
    )
    .join("");
  const hasDialogs = dialogs.length > 0;
  const stateTypes = [
    ...new Set(state.flatMap(([, def]) => referencedModelTypes(def.type, modelTypes))),
  ].sort();
  files.add(
    "src/store/appStore.ts",
    `import { create } from "zustand";
${dialogImports}${stateTypes.length > 0 ? `import type { ${stateTypes.join(", ")} } from "../model";\n` : ""}import { sampleData, type Data } from "./sampleData";

/** アプリ全体の状態（\`{{ state.xxx }}\`）。 */
export interface AppState {
${state.map(([k, def]) => `  ${k}: ${def.type};\n`).join("")}}

${hasDialogs ? `/** 開いているダイアログと、その params。 */\nexport type OpenDialog =\n${openDialogType};\n\n` : ""}const initialState: AppState = ${JSON.stringify(Object.fromEntries(state.map(([k, def]) => [k, def.initial])), null, 2)};

export interface AppStore {
  data: Data;
  state: AppState;
  /** state のドットパスに値を入れる。例: \`setState("draft.network.ip", "10.0.0.1")\` */
  setState: (path: string, value: unknown) => void;
  /** data[collection] のうち match に一致するレコードに fields を上書きする。 */
  updateData: <K extends keyof Data>(
    collection: K,
    match: Partial<Data[K][number]>,
    fields: Partial<Data[K][number]>,
  ) => void;
${
  hasDialogs
    ? `  /** 開いているダイアログ（同時に 1 つ）。 */
  dialog: OpenDialog | null;
  openDialog: (dialog: OpenDialog) => void;
  closeDialog: () => void;
`
    : ""
}}

export const useAppStore = create<AppStore>()((set) => ({
  // 差し替えポイント: いまはサンプルデータを初期値にしている。
  // API から取得するときは、ここを空の配列にして、取得した結果を入れる処理
  // （または TanStack Query などのサーバー状態）に置き換える。
  data: sampleData,
  state: initialState,
  setState: (path, value) =>
    set((store) => ({ state: setIn(store.state, path.split("."), value) })),
  updateData: (collection, match, fields) =>
    set((store) => ({
      data: {
        ...store.data,
        [collection]: (store.data[collection] as object[]).map((record) =>
          matches(record, match) ? { ...record, ...fields } : record,
        ),
      },
    })),
${
  hasDialogs
    ? `  dialog: null,
  openDialog: (dialog) => set({ dialog }),
  closeDialog: () => set({ dialog: null }),
`
    : ""
}}));

/** obj の path の位置を value にしたコピーを返す（途中のオブジェクトもコピーする）。 */
function setIn<T>(obj: T, path: string[], value: unknown): T {
  const [head, ...rest] = path;
  if (head === undefined) return value as T;
  const current = (obj ?? {}) as Record<string, unknown>;
  return { ...current, [head]: setIn(current[head], rest, value) } as T;
}

function matches(record: object, match: object): boolean {
  return Object.entries(match).every(
    ([key, value]) => (record as Record<string, unknown>)[key] === value,
  );
}
`,
  );
}
