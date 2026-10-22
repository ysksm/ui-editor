import { create } from "zustand";
import { initialState, sampleData } from "../model/data";
import { schema } from "../model/schema";
import type {
  Dataset,
  DialogName,
  DialogParams,
  Entities,
  EntityName,
  UiState,
  Values,
} from "../model/types";
import * as datastore from "../runtime/datastore";
import { setPath } from "../runtime/values";

/**
 * アプリの状態（Zustand のストア）: データ・state・選択・開いているダイアログ・お知らせ。
 * データはメモリの中だけにある。API に替えるときは、この下の「データの変更」と records.ts を書き換える。
 */

/** 閉じた結果（ok / cancel など）→ 呼び出し元の処理（openDialog の onClose）。 */
export type DialogCallbacks = Partial<Record<string, () => void>>;

/** 開いているダイアログ（名前ごとにパラメータの型が決まる）。 */
export type OpenDialog = {
  [N in DialogName]: { key: number; name: N; params: DialogParams[N]; onClose?: DialogCallbacks };
}[DialogName];

export interface Notice {
  level: "info" | "error";
  message: string;
}

export interface AppState {
  /** データ（ルートのエンティティ → レコード。入れ子のエンティティは親のレコードの中）。 */
  data: Dataset;
  state: UiState;
  /** エンティティ id → 選択中のレコードの主キー。 */
  selection: Partial<Record<EntityName, string | null>>;
  /** 開いているダイアログ（最後が最前面）。 */
  dialogs: OpenDialog[];
  notice: Notice | null;
}

export const useAppStore = create<AppState>(() => ({
  data: sampleData,
  state: initialState,
  selection: {},
  dialogs: [],
  notice: null,
}));

// ---- ダイアログ ----

let dialogKey = 0;

/** ダイアログを開く（今のダイアログの上に重ねる）。 */
export function openDialog<N extends DialogName>(
  name: N,
  params: DialogParams[N],
  onClose?: DialogCallbacks,
): void {
  const dialog = { key: ++dialogKey, name, params, onClose } as OpenDialog;
  useAppStore.setState((s) => ({ dialogs: [...s.dialogs, dialog] }));
}

/** 最前面のダイアログを閉じ、開いたときの onClose の result の処理を呼ぶ。 */
export function closeDialog(result = "ok"): void {
  const top = useAppStore.getState().dialogs.at(-1);
  if (!top) return;
  useAppStore.setState((s) => ({ dialogs: s.dialogs.slice(0, -1) }));
  top.onClose?.[result]?.();
}

/** ダイアログをすべて閉じる（画面を移るとき）。onClose は呼ばない。 */
export function closeAllDialogs(): void {
  useAppStore.setState({ dialogs: [] });
}

// ---- state・選択・お知らせ ----

/** state のパス（`filter.keyword` など）に値を入れる。 */
export function setUiState(path: string, value: unknown): void {
  useAppStore.setState((s) => ({ state: setPath(s.state, path, value) }));
}

/** エンティティの選択を変える（null・空で解除）。 */
export function select(entity: EntityName, id: unknown): void {
  const value = id === null || id === undefined || id === "" ? null : String(id);
  useAppStore.setState((s) => ({ selection: { ...s.selection, [entity]: value } }));
}

export function notify(level: Notice["level"], message: string): void {
  useAppStore.setState({ notice: { level, message } });
}

export function dismissNotice(): void {
  useAppStore.setState({ notice: null });
}

/** データと state を初期値に戻す（選択も外す）。 */
export function resetData(): void {
  useAppStore.setState({ data: sampleData, state: initialState, selection: {}, notice: null });
}

// ---- データの変更（失敗したらお知らせに出して、結果を返す） ----

export type Result<T = object> = datastore.DataResult<Dataset, T>;

function apply<T>(result: Result<T>, verb: string): Result<T> {
  if (result.ok) {
    useAppStore.setState({ data: result.data });
  } else {
    const fields = Object.entries(result.fieldErrors ?? {})
      .map(([k, v]) => `${k}: ${v}`)
      .join("、");
    notify("error", `${verb}できませんでした: ${result.error}${fields ? `（${fields}）` : ""}`);
  }
  return result;
}

/** レコードを作る。入れ子のエンティティは親の主キーを渡す。 */
export function createRecord<E extends EntityName>(
  entity: E,
  values: Values<E>,
  parent?: string,
): Result<{ record: Entities[E] }> {
  const { data } = useAppStore.getState();
  const result = datastore.createRecord(schema, data, entity, values, parent);
  return apply(result as Result<{ record: Entities[E] }>, "作成");
}

/** 条件（項目 = 値 の AND）に合うレコードを更新する。 */
export function updateRecords<E extends EntityName>(
  entity: E,
  match: Values<E>,
  set: Values<E>,
): Result {
  const { data } = useAppStore.getState();
  return apply(datastore.updateRecords(schema, data, entity, match, set), "更新");
}

/** 条件に合うレコードを子ごと削除する（参照は onDelete に従う）。 */
export function deleteRecords<E extends EntityName>(entity: E, match: Values<E>): Result {
  const { data } = useAppStore.getState();
  return apply(datastore.deleteRecords(schema, data, entity, match), "削除");
}
