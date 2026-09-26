import { create } from "zustand";
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

const initialState: AppState = {
  draftSettings: null,
};

export interface AppStore {
  data: Data;
  state: AppState;
  /** state のドットパスに値を入れる。例: `setState("draft.network.ip", "10.0.0.1")` */
  setState: (path: string, value: unknown) => void;
  /** data[collection] のうち match に一致するレコードに fields を上書きする。 */
  updateData: <K extends keyof Data>(
    collection: K,
    match: Partial<Data[K][number]>,
    fields: Partial<Data[K][number]>,
  ) => void;
  /** 開いているダイアログ（同時に 1 つ）。 */
  dialog: OpenDialog | null;
  openDialog: (dialog: OpenDialog) => void;
  closeDialog: () => void;
}

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
  dialog: null,
  openDialog: (dialog) => set({ dialog }),
  closeDialog: () => set({ dialog: null }),
}));

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
