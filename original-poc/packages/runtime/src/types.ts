import type { DataChange, Dataset } from "@ui-editor/poc-datastore";
import type { Action, ContainerKind, DataRecord, JsonValue } from "@ui-editor/poc-model";

/** アクションを実行するときの文脈（イベントを発火した場所）。 */
export interface CallContext {
  /** イベントを発火したフレーム。 */
  frameId: number;
  container: string;
  params: Readonly<Record<string, unknown>>;
  /** イベントの値（event.row / event.value）。 */
  event?: unknown;
  /** ループ変数など。 */
  locals?: Readonly<Record<string, unknown>> | undefined;
  /** 遷移の key の頭（`<画面>:<ノード>:<イベント>:`）。i 番目のアクションの key は頭 + i。 */
  keyPrefix: string;
}

/** 開いている画面・ダイアログ。 */
export interface Frame {
  /** React の key・イベントの宛先に使う番号（開くたびに新しくなる）。 */
  id: number;
  container: string;
  kind: ContainerKind;
  params: Readonly<Record<string, unknown>>;
  /** フォームの下書き（kind: form と entity を持つとき）。 */
  draft?: DataRecord | undefined;
  /** 下書きの検証エラー（項目 id → メッセージ）。 */
  errors?: Readonly<Record<string, string>> | undefined;
  /** ダイアログを開いた openDialog の onClose と、呼び出し元の文脈。 */
  onClose?: { actions: Readonly<Record<string, Action[]>>; caller: CallContext } | undefined;
}

/** たどった遷移（フロー図の強調用）。key は extractTransitions の key と同じ形。 */
export interface TrailEntry {
  key: string;
  from: string;
  to: string;
}

export interface LogEntry {
  seq: number;
  level: "info" | "error";
  message: string;
  /** 実行した場所（画面・ダイアログ id）。 */
  container?: string | undefined;
  /** データの変更（作成・更新・削除・カスケード）。 */
  changes?: DataChange[] | undefined;
}

/** プレビューの状態。すべての操作は新しい状態を返す（元は変えない）。 */
export interface RuntimeState {
  /** サンプルデータの複製（元のサンプルデータは書き換えない）。 */
  data: Dataset;
  state: Readonly<Record<string, JsonValue>>;
  /** エンティティ id → 選択中のレコードの主キー。 */
  selection: Readonly<Record<string, string | null>>;
  /** 画面の履歴（最後が今の画面）。 */
  history: Frame[];
  /** 開いているダイアログ（最後が最前面）。 */
  dialogs: Frame[];
  trail: TrailEntry[];
  log: LogEntry[];
  /** フレームとログの番号。 */
  seq: number;
}
