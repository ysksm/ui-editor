import type { ScreenName } from "./types";

export interface ScreenDef {
  /** ルートのパス（`:name` はパラメータ）。 */
  path: string;
  /** パラメータ → 型（パスとクエリ文字列の値を変換する）。 */
  params: Record<string, "string" | "number" | "boolean">;
}

/** 画面 id → パスとパラメータ。 */
export const SCREENS: Record<ScreenName, ScreenDef> = {
  /** ダッシュボード */
  dashboard: { path: "/", params: {} },
  /** 機器一覧 */
  devices: { path: "/devices", params: {} },
  /** 機器詳細 */
  deviceDetail: { path: "/devices/:deviceId", params: { deviceId: "string" } },
};
