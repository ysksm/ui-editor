// データモデル（プロジェクトファイルの dataModel.source）

export type DeviceStatus = "online" | "offline" | "warning";

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
  timestamp: string;
  temperature: number;
  cpu: number;
  trafficMbps: number;
}

export interface Alarm {
  id: string;
  deviceId: string;
  level: "info" | "warn" | "error";
  message: string;
  occurredAt: string;
  acknowledged: boolean;
}
