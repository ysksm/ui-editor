import type { Alarm, Device, DeviceSettings, Metric, SampleData } from "./model.js";

export const devices: Device[] = [
  {
    id: "dev-001",
    name: "コアスイッチ A",
    model: "CS-9000",
    status: "online",
    ipAddress: "192.168.10.1",
    firmware: "4.2.1",
  },
  {
    id: "dev-002",
    name: "コアスイッチ B",
    model: "CS-9000",
    status: "online",
    ipAddress: "192.168.10.2",
    firmware: "4.2.1",
  },
  {
    id: "dev-003",
    name: "エッジルーター 1F",
    model: "ER-450",
    status: "warning",
    ipAddress: "192.168.20.1",
    firmware: "2.8.0",
  },
  {
    id: "dev-004",
    name: "無線 AP 2F",
    model: "AP-300",
    status: "offline",
    ipAddress: "192.168.30.12",
    firmware: "1.9.5",
  },
  {
    id: "dev-005",
    name: "環境センサー サーバー室",
    model: "ENV-10",
    status: "online",
    ipAddress: "192.168.40.5",
    firmware: "0.9.3",
  },
];

export const deviceSettings: DeviceSettings[] = [
  {
    deviceId: "dev-001",
    network: {
      dhcp: false,
      ip: "192.168.10.1",
      subnet: "255.255.255.0",
      gateway: "192.168.10.254",
    },
    thresholds: { temperatureMax: 70, cpuMax: 85 },
    pollingIntervalSec: 30,
  },
  {
    deviceId: "dev-002",
    network: {
      dhcp: false,
      ip: "192.168.10.2",
      subnet: "255.255.255.0",
      gateway: "192.168.10.254",
    },
    thresholds: { temperatureMax: 70, cpuMax: 85 },
    pollingIntervalSec: 30,
  },
  {
    deviceId: "dev-003",
    network: {
      dhcp: false,
      ip: "192.168.20.1",
      subnet: "255.255.255.0",
      gateway: "192.168.20.254",
    },
    thresholds: { temperatureMax: 65, cpuMax: 80 },
    pollingIntervalSec: 60,
  },
  {
    deviceId: "dev-004",
    network: {
      dhcp: true,
      ip: "192.168.30.12",
      subnet: "255.255.255.0",
      gateway: "192.168.30.254",
    },
    thresholds: { temperatureMax: 60, cpuMax: 90 },
    pollingIntervalSec: 120,
  },
  {
    deviceId: "dev-005",
    network: { dhcp: true, ip: "192.168.40.5", subnet: "255.255.255.0", gateway: "192.168.40.254" },
    thresholds: { temperatureMax: 35, cpuMax: 95 },
    pollingIntervalSec: 300,
  },
];

/** メトリクスの最終時刻。サンプルは決定的にするため固定値にする。 */
export const METRICS_END = "2026-09-27T09:00:00.000Z";
/** 1 機器あたりのメトリクス点数（1 分間隔）。 */
export const METRIC_POINTS = 30;

interface MetricProfile {
  deviceId: string;
  baseTemperature: number;
  baseCpu: number;
  baseTraffic: number;
  /** オフラインになった時点（何点目まで記録があるか）。 */
  points: number;
}

const metricProfiles: MetricProfile[] = [
  {
    deviceId: "dev-001",
    baseTemperature: 48,
    baseCpu: 35,
    baseTraffic: 820,
    points: METRIC_POINTS,
  },
  {
    deviceId: "dev-002",
    baseTemperature: 46,
    baseCpu: 28,
    baseTraffic: 640,
    points: METRIC_POINTS,
  },
  // warning: 温度が閾値（65℃）付近
  {
    deviceId: "dev-003",
    baseTemperature: 63,
    baseCpu: 72,
    baseTraffic: 210,
    points: METRIC_POINTS,
  },
  // offline: 途中で記録が途切れている
  { deviceId: "dev-004", baseTemperature: 41, baseCpu: 12, baseTraffic: 35, points: 12 },
  { deviceId: "dev-005", baseTemperature: 24, baseCpu: 5, baseTraffic: 0.4, points: METRIC_POINTS },
];

const round1 = (n: number): number => Math.round(n * 10) / 10;

/** 乱数を使わず、インデックスから決定的に揺らぎを作る。 */
function buildMetrics(profile: MetricProfile): Metric[] {
  const end = Date.parse(METRICS_END);
  const result: Metric[] = [];
  for (let i = 0; i < profile.points; i++) {
    const minutesAgo = METRIC_POINTS - 1 - i;
    const wave = Math.sin(i / 3);
    result.push({
      deviceId: profile.deviceId,
      timestamp: new Date(end - minutesAgo * 60_000).toISOString(),
      temperature: round1(profile.baseTemperature + wave * 2 + i * 0.05),
      cpu: round1(Math.min(100, Math.max(0, profile.baseCpu + Math.cos(i / 2) * 8))),
      trafficMbps: round1(Math.max(0, profile.baseTraffic * (1 + wave * 0.15))),
    });
  }
  return result;
}

export const metrics: Metric[] = metricProfiles.flatMap(buildMetrics);

export const alarms: Alarm[] = [
  {
    id: "alm-001",
    deviceId: "dev-004",
    level: "error",
    message: "機器との通信が途絶しました",
    occurredAt: "2026-09-27T08:42:10.000Z",
    acknowledged: false,
  },
  {
    id: "alm-002",
    deviceId: "dev-003",
    level: "warn",
    message: "温度が閾値に近づいています（63.8℃ / 65℃）",
    occurredAt: "2026-09-27T08:55:03.000Z",
    acknowledged: false,
  },
  {
    id: "alm-003",
    deviceId: "dev-003",
    level: "warn",
    message: "CPU 使用率が 80% を超えました",
    occurredAt: "2026-09-27T08:31:47.000Z",
    acknowledged: false,
  },
  {
    id: "alm-004",
    deviceId: "dev-001",
    level: "info",
    message: "設定が保存されました",
    occurredAt: "2026-09-27T07:10:00.000Z",
    acknowledged: true,
  },
  {
    id: "alm-005",
    deviceId: "dev-002",
    level: "info",
    message: "ファームウェア 4.2.1 に更新されました",
    occurredAt: "2026-09-26T22:05:12.000Z",
    acknowledged: true,
  },
  {
    id: "alm-006",
    deviceId: "dev-004",
    level: "warn",
    message: "応答時間が遅延しています（1200ms）",
    occurredAt: "2026-09-27T08:39:55.000Z",
    acknowledged: false,
  },
  {
    id: "alm-007",
    deviceId: "dev-005",
    level: "info",
    message: "ポーリング間隔が 300 秒に変更されました",
    occurredAt: "2026-09-26T18:20:00.000Z",
    acknowledged: true,
  },
  {
    id: "alm-008",
    deviceId: "dev-001",
    level: "error",
    message: "ポート 24 のリンクがダウンしました",
    occurredAt: "2026-09-27T06:12:33.000Z",
    acknowledged: true,
  },
  {
    id: "alm-009",
    deviceId: "dev-002",
    level: "warn",
    message: "通信量が急増しています（950Mbps）",
    occurredAt: "2026-09-27T05:48:20.000Z",
    acknowledged: false,
  },
  {
    id: "alm-010",
    deviceId: "dev-005",
    level: "error",
    message: "センサー値の読み取りに失敗しました",
    occurredAt: "2026-09-26T15:02:41.000Z",
    acknowledged: true,
  },
];

export const sampleData: SampleData = { devices, deviceSettings, metrics, alarms };
