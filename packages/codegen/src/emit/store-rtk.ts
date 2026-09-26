import type { Project } from "@ui-editor/schema";
import type { FileSet } from "../files.js";
import { storeTypes } from "./store.js";

/** RTK 版で使うライブラリ（比較用。生成アプリの package.json には入れない）。 */
export const RTK_DEPENDENCIES = {
  "@reduxjs/toolkit": "^2.12.0",
  "react-redux": "^9.3.0",
} as const;

/**
 * Zustand 版の src/store/appStore.ts と同じ機能を Redux Toolkit で書いたもの（#12 の比較用）。
 * sampleData.ts は Zustand 版と共通。
 */
export function writeRtkStore(files: FileSet, project: Project, modelTypes: readonly string[]) {
  const { dialogImports, stateTypes, appStateType, openDialogType, initialState, hasDialogs } =
    storeTypes(project, modelTypes);
  files.add(
    "src/store/appStore.ts",
    `import { configureStore, createSlice, type PayloadAction } from "@reduxjs/toolkit";
import { useDispatch, useSelector } from "react-redux";
${dialogImports}${stateTypes.length > 0 ? `import type { ${stateTypes.join(", ")} } from "../model";\n` : ""}import { sampleData, type Data } from "./sampleData";

${appStateType}${openDialogType}export interface AppSliceState {
  data: Data;
  state: AppState;
${hasDialogs ? "  /** 開いているダイアログ（同時に 1 つ）。 */\n  dialog: OpenDialog | null;\n" : ""}}

const initialState: AppSliceState = {
  // 差し替えポイント: いまはサンプルデータを初期値にしている。
  // API から取得するときは、ここを空の配列にして、createAsyncThunk（または RTK Query）で取得した結果を入れる。
  data: sampleData,
  state: ${initialState},
${hasDialogs ? "  dialog: null,\n" : ""}};

const appSlice = createSlice({
  name: "app",
  initialState,
  // reducer の中では Immer で直接書き換えてよい
  reducers: {
    /** state のドットパスに値を入れる。例: \`setState({ path: "draft.network.ip", value: "10.0.0.1" })\` */
    setState(store, action: PayloadAction<{ path: string; value: unknown }>) {
      const keys = action.payload.path.split(".");
      const last = keys.pop()!;
      let target = store.state as Record<string, unknown>;
      for (const key of keys) target = target[key] as Record<string, unknown>;
      target[last] = action.payload.value;
    },
    /** data[collection] のうち match に一致するレコードに fields を上書きする。 */
    updateData(
      store,
      action: PayloadAction<{
        collection: keyof Data;
        match: Record<string, unknown>;
        fields: Record<string, unknown>;
      }>,
    ) {
      const { collection, match, fields } = action.payload;
      for (const record of store.data[collection] as Record<string, unknown>[]) {
        if (Object.entries(match).every(([key, value]) => record[key] === value)) {
          Object.assign(record, fields);
        }
      }
    },
${
  hasDialogs
    ? `    openDialog(store, action: PayloadAction<OpenDialog>) {
      store.dialog = action.payload;
    },
    closeDialog(store) {
      store.dialog = null;
    },
`
    : ""
}  },
});

export const { ${hasDialogs ? "setState, updateData, openDialog, closeDialog" : "setState, updateData"} } = appSlice.actions;

export const store = configureStore({ reducer: appSlice.reducer });

export type RootState = ReturnType<typeof store.getState>;
export const useAppSelector = useSelector.withTypes<RootState>();
export const useAppDispatch = useDispatch.withTypes<typeof store.dispatch>();
`,
  );
}
