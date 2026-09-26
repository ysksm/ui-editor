/** 生成するファイル・識別子の命名規則。 */

/** `device-settings` / `deviceSettings` → `DeviceSettings` */
export function pascalCase(id: string): string {
  return id
    .split(/[-_]/)
    .filter(Boolean)
    .map((part) => part[0]!.toUpperCase() + part.slice(1))
    .join("");
}

/** `DeviceSettings` / `device-settings` → `deviceSettings` */
export function camelCase(id: string): string {
  const pascal = pascalCase(id);
  return pascal[0]!.toLowerCase() + pascal.slice(1);
}

/** 画面 id → 画面コンポーネント名。例: `dashboard` → `DashboardScreen` */
export function screenName(id: string): string {
  return `${pascalCase(id)}Screen`;
}

/** ダイアログ id → ダイアログコンポーネント名。例: `saveConfirm` → `SaveConfirmDialog` */
export function dialogName(id: string): string {
  return `${pascalCase(id)}Dialog`;
}

/**
 * プロジェクトファイルのパスから、生成するアプリのパッケージ名を決める。
 * 例: `examples/device-monitor.project.yaml` → `device-monitor`
 */
export function appNameFromPath(path: string): string {
  const base = path.split(/[\\/]/).pop() ?? "app";
  const name = base
    .replace(/\.(json|ya?ml)$/i, "")
    .replace(/\.project$/i, "")
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^[._-]+|[._-]+$/g, "");
  return name || "app";
}
