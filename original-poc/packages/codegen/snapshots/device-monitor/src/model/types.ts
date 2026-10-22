import type { FieldValue } from "../runtime/datastore";

/**
 * 「機器の設定＆モニタリング」の型（ER から生成）。
 * 必須でない項目はサンプルデータで省略されうるので `?`、値が無いときは null。
 */

export type { FieldValue };

/** 機器 */
export type Device = {
  /** id（主キー） */
  id: string;
  /** 名前（必須） */
  name: string;
  /** 型番 */
  model?: string | null;
  /** 状態（既定値 "online"） */
  status?: "online" | "offline" | "warning" | null;
  /** IP アドレス（書式 ipv4） */
  ipAddress?: string | null;
  /** ファームウェア */
  firmware?: string | null;
  /** 設定（入れ子の機器設定、1 件） */
  settings?: DeviceSettings | null;
  /** メトリクス（入れ子のメトリクス） */
  metrics?: Metric[];
  /** アラーム（入れ子のアラーム） */
  alarms?: Alarm[];
};

/** 機器設定（機器の入れ子） */
export type DeviceSettings = {
  /** id（主キー） */
  id: string;
  /** DHCP（既定値 false） */
  dhcp?: boolean | null;
  /** IP アドレス（書式 ipv4） */
  ip?: string | null;
  /** サブネットマスク（書式 ipv4） */
  subnet?: string | null;
  /** ゲートウェイ（書式 ipv4） */
  gateway?: string | null;
  /** 温度の上限（℃）（0〜120） */
  temperatureMax?: number | null;
  /** CPU 使用率の上限（%）（0〜100） */
  cpuMax?: number | null;
  /** ポーリング間隔（秒）（5〜3600） */
  pollingIntervalSec?: number | null;
};

/** メトリクス（機器の入れ子） */
export type Metric = {
  /** id（主キー） */
  id: string;
  /** 日時（必須、ISO 8601、書式 datetime） */
  timestamp: string;
  /** 温度（℃） */
  temperature?: number | null;
  /** CPU 使用率（%）（0〜100） */
  cpu?: number | null;
  /** 通信量（Mbps）（0〜） */
  trafficMbps?: number | null;
};

/** アラーム（機器の入れ子） */
export type Alarm = {
  /** id（主キー） */
  id: string;
  /** レベル（必須） */
  level: "info" | "warn" | "error";
  /** 内容（必須） */
  message: string;
  /** 発生日時（ISO 8601、書式 datetime） */
  occurredAt?: string | null;
  /** 確認済み（既定値 false） */
  acknowledged?: boolean | null;
};

/** エンティティ id → 型。 */
export type Entities = {
  Device: Device;
  DeviceSettings: DeviceSettings;
  Metric: Metric;
  Alarm: Alarm;
};

export type EntityName = keyof Entities;

/** エンティティ id → 項目名（入れ子の項目を除く）。 */
export type EntityFields = {
  Device: "id" | "name" | "model" | "status" | "ipAddress" | "firmware";
  DeviceSettings:
    | "id"
    | "dhcp"
    | "ip"
    | "subnet"
    | "gateway"
    | "temperatureMax"
    | "cpuMax"
    | "pollingIntervalSec";
  Metric: "id" | "timestamp" | "temperature" | "cpu" | "trafficMbps";
  Alarm: "id" | "level" | "message" | "occurredAt" | "acknowledged";
};

/** 作成・更新・検索に渡す値（項目名 → 値）。保存の前に検証する。 */
export type Values<E extends EntityName> = { [K in EntityFields[E]]?: FieldValue };

/** データ（ルートのエンティティ → レコード。入れ子のエンティティは親のレコードの中）。 */
export type Dataset = {
  Device: Device[];
};

/** 式の data: エンティティごとの一覧（入れ子のエンティティは全親の子を並べたもの。読み取り専用）。 */
export type DataView = {
  /** 機器 */
  readonly Device: readonly Device[];
  /** 機器設定（機器の入れ子） */
  readonly DeviceSettings: readonly DeviceSettings[];
  /** メトリクス（機器の入れ子） */
  readonly Metric: readonly Metric[];
  /** アラーム（機器の入れ子） */
  readonly Alarm: readonly Alarm[];
};

/** 利用者が定義した状態（state）。 */
export type UiState = Record<never, never>;

/** 式の state.selection: 選択中のレコード（無ければ null）。 */
export type Selected = {
  Device: Device | null;
  DeviceSettings: DeviceSettings | null;
  Metric: Metric | null;
  Alarm: Alarm | null;
};

/** 式の state: 利用者が定義した状態と、選択中のレコード。 */
export type ScopeState = UiState & { selection: Selected };

/** 画面 id → パラメータ。 */
export type ScreenParams = {
  /** ダッシュボード */
  dashboard: Record<never, never>;
  /** 機器一覧 */
  devices: Record<never, never>;
  /** 機器詳細 */
  deviceDetail: { deviceId: string };
};

export type ScreenName = keyof ScreenParams;

/** ダイアログ id → パラメータ。 */
export type DialogParams = {
  /** 機器の編集 */
  deviceEdit: { deviceId: string };
  /** 削除の確認 */
  deviceDelete: { deviceId: string };
};

export type DialogName = keyof DialogParams;
