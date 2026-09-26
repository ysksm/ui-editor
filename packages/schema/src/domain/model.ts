/**
 * 題材アプリ「機器の設定＆モニタリング」のデータモデル。
 * #1 の案をそのまま TS 型にしたもの。
 */

export const DEVICE_STATUSES = ["online", "offline", "warning"] as const;
export type DeviceStatus = (typeof DEVICE_STATUSES)[number];

export const ALARM_LEVELS = ["info", "warn", "error"] as const;
export type AlarmLevel = (typeof ALARM_LEVELS)[number];

export interface Device {
  id: string;
  name: string;
  model: string;
  status: DeviceStatus;
  ipAddress: string;
  firmware: string;
}

export interface DeviceSettings {
  deviceId: string;
  network: { dhcp: boolean; ip: string; subnet: string; gateway: string };
  thresholds: { temperatureMax: number; cpuMax: number };
  pollingIntervalSec: number;
}

export interface Metric {
  deviceId: string;
  /** ISO 8601 (UTC) */
  timestamp: string;
  /** ℃ */
  temperature: number;
  /** % */
  cpu: number;
  trafficMbps: number;
}

export interface Alarm {
  id: string;
  deviceId: string;
  level: AlarmLevel;
  message: string;
  /** ISO 8601 (UTC) */
  occurredAt: string;
  acknowledged: boolean;
}

/** 題材アプリが扱うデータ一式。 */
export interface SampleData {
  devices: Device[];
  deviceSettings: DeviceSettings[];
  metrics: Metric[];
  alarms: Alarm[];
}
