import type { Values } from "../model/types";
import { createRecord, deleteRecords, updateRecords } from "./store";

/**
 * エンティティごとのデータの変更。失敗するとお知らせを出し、`{ ok: false, error, fieldErrors }` を返す。
 * データの取得元を API に替えるときは、ここと store.ts の「データの変更」を書き換える。
 */

// ---- 機器（Device） ----

/** 機器を作る。主キーを省くと採番する。 */
export function createDevice(values: Values<"Device">) {
  return createRecord("Device", values);
}

/** 条件（項目 = 値。すべて合うもの）に合う機器を更新する。 */
export function updateDevice(match: Values<"Device">, set: Values<"Device">) {
  return updateRecords("Device", match, set);
}

/** 条件に合う機器を削除する。入れ子の機器設定・メトリクス・アラームも消える。 */
export function deleteDevice(match: Values<"Device">) {
  return deleteRecords("Device", match);
}

// ---- 機器設定（DeviceSettings。機器の入れ子） ----

/** 機器設定を作る（親の機器の主キーを渡す）。主キーを省くと採番する。 */
export function createDeviceSettings(parentId: string, values: Values<"DeviceSettings">) {
  return createRecord("DeviceSettings", values, parentId);
}

/** 条件（項目 = 値。すべて合うもの）に合う機器設定を更新する。 */
export function updateDeviceSettings(
  match: Values<"DeviceSettings">,
  set: Values<"DeviceSettings">,
) {
  return updateRecords("DeviceSettings", match, set);
}

/** 条件に合う機器設定を削除する。ほかのデータは変わらない。 */
export function deleteDeviceSettings(match: Values<"DeviceSettings">) {
  return deleteRecords("DeviceSettings", match);
}

// ---- メトリクス（Metric。機器の入れ子） ----

/** メトリクスを作る（親の機器の主キーを渡す）。主キーを省くと採番する。 */
export function createMetric(parentId: string, values: Values<"Metric">) {
  return createRecord("Metric", values, parentId);
}

/** 条件（項目 = 値。すべて合うもの）に合うメトリクスを更新する。 */
export function updateMetric(match: Values<"Metric">, set: Values<"Metric">) {
  return updateRecords("Metric", match, set);
}

/** 条件に合うメトリクスを削除する。ほかのデータは変わらない。 */
export function deleteMetric(match: Values<"Metric">) {
  return deleteRecords("Metric", match);
}

// ---- アラーム（Alarm。機器の入れ子） ----

/** アラームを作る（親の機器の主キーを渡す）。主キーを省くと採番する。 */
export function createAlarm(parentId: string, values: Values<"Alarm">) {
  return createRecord("Alarm", values, parentId);
}

/** 条件（項目 = 値。すべて合うもの）に合うアラームを更新する。 */
export function updateAlarm(match: Values<"Alarm">, set: Values<"Alarm">) {
  return updateRecords("Alarm", match, set);
}

/** 条件に合うアラームを削除する。ほかのデータは変わらない。 */
export function deleteAlarm(match: Values<"Alarm">) {
  return deleteRecords("Alarm", match);
}
