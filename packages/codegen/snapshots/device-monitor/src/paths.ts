import type { DeviceSettingsScreenParams } from "./screens/DeviceSettingsScreen";

/** 画面の URL。例: `navigate(paths.dashboard())` */
export const paths = {
  /** ダッシュボード */
  dashboard: () => "/",
  /** 機器一覧 */
  devices: () => "/devices",
  /** 機器設定 */
  deviceSettings: (params: DeviceSettingsScreenParams) =>
    `/devices/${encodeURIComponent(params.deviceId)}`,
};
