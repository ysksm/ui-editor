import type { Schema } from "../runtime/datastore";

/** ER（エンティティの定義）。データの検証・採番・入れ子・削除の規則に使う。 */
export const schema: Schema = {
  entities: [
    {
      id: "Device",
      name: "機器",
      primaryKey: "id",
      displayField: "name",
      fields: [
        { id: "id", type: "id" },
        { id: "name", name: "名前", type: "string", required: true },
        { id: "model", name: "型番", type: "string" },
        {
          id: "status",
          name: "状態",
          type: "enum",
          default: "online",
          values: ["online", "offline", "warning"],
        },
        { id: "ipAddress", name: "IP アドレス", type: "string" },
        { id: "firmware", name: "ファームウェア", type: "string" },
        {
          id: "settings",
          name: "設定",
          type: "children",
          entity: "DeviceSettings",
          cardinality: "one",
        },
        { id: "metrics", name: "メトリクス", type: "children", entity: "Metric" },
        { id: "alarms", name: "アラーム", type: "children", entity: "Alarm" },
      ],
    },
    {
      id: "DeviceSettings",
      name: "機器設定",
      primaryKey: "id",
      displayField: "ip",
      fields: [
        { id: "id", type: "id" },
        { id: "dhcp", name: "DHCP", type: "boolean", default: false },
        { id: "ip", name: "IP アドレス", type: "string" },
        { id: "subnet", name: "サブネットマスク", type: "string" },
        { id: "gateway", name: "ゲートウェイ", type: "string" },
        { id: "temperatureMax", name: "温度の上限（℃）", type: "number", min: 0, max: 120 },
        { id: "cpuMax", name: "CPU 使用率の上限（%）", type: "number", min: 0, max: 100 },
        {
          id: "pollingIntervalSec",
          name: "ポーリング間隔（秒）",
          type: "number",
          min: 5,
          max: 3600,
        },
      ],
    },
    {
      id: "Metric",
      name: "メトリクス",
      primaryKey: "id",
      displayField: "timestamp",
      fields: [
        { id: "id", type: "id" },
        { id: "timestamp", name: "日時", type: "date", required: true },
        { id: "temperature", name: "温度（℃）", type: "number" },
        { id: "cpu", name: "CPU 使用率（%）", type: "number", min: 0, max: 100 },
        { id: "trafficMbps", name: "通信量（Mbps）", type: "number", min: 0 },
      ],
    },
    {
      id: "Alarm",
      name: "アラーム",
      primaryKey: "id",
      displayField: "message",
      fields: [
        { id: "id", type: "id" },
        {
          id: "level",
          name: "レベル",
          type: "enum",
          required: true,
          values: ["info", "warn", "error"],
        },
        { id: "message", name: "内容", type: "string", required: true },
        { id: "occurredAt", name: "発生日時", type: "date" },
        { id: "acknowledged", name: "確認済み", type: "boolean", default: false },
      ],
    },
  ],
  nest: {
    DeviceSettings: { parent: "Device", field: "settings", cardinality: "one" },
    Metric: { parent: "Device", field: "metrics", cardinality: "many" },
    Alarm: { parent: "Device", field: "alarms", cardinality: "many" },
  },
};
