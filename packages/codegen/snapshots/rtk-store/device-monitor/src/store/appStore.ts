import { configureStore, createSlice, type PayloadAction } from "@reduxjs/toolkit";
import { useDispatch, useSelector } from "react-redux";
import type { AlarmDetailDialogParams } from "../dialogs/AlarmDetailDialog";
import type { SaveConfirmDialogParams } from "../dialogs/SaveConfirmDialog";
import type { DeviceSettings } from "../model";
import { sampleData, type Data } from "./sampleData";

/** アプリ全体の状態（`{{ state.xxx }}`）。 */
export interface AppState {
  draftSettings: DeviceSettings | null;
}

/** 開いているダイアログと、その params。 */
export type OpenDialog =
  | { id: "saveConfirm"; params: SaveConfirmDialogParams }
  | { id: "alarmDetail"; params: AlarmDetailDialogParams };

export interface AppSliceState {
  data: Data;
  state: AppState;
  /** 開いているダイアログ（同時に 1 つ）。 */
  dialog: OpenDialog | null;
}

const initialState: AppSliceState = {
  // 差し替えポイント: いまはサンプルデータを初期値にしている。
  // API から取得するときは、ここを空の配列にして、createAsyncThunk（または RTK Query）で取得した結果を入れる。
  data: sampleData,
  state: {
    draftSettings: null,
  },
  dialog: null,
};

const appSlice = createSlice({
  name: "app",
  initialState,
  // reducer の中では Immer で直接書き換えてよい
  reducers: {
    /** state のドットパスに値を入れる。例: `setState({ path: "draft.network.ip", value: "10.0.0.1" })` */
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
    openDialog(store, action: PayloadAction<OpenDialog>) {
      store.dialog = action.payload;
    },
    closeDialog(store) {
      store.dialog = null;
    },
  },
});

export const { setState, updateData, openDialog, closeDialog } = appSlice.actions;

export const store = configureStore({ reducer: appSlice.reducer });

export type RootState = ReturnType<typeof store.getState>;
export const useAppSelector = useSelector.withTypes<RootState>();
export const useAppDispatch = useDispatch.withTypes<typeof store.dispatch>();
