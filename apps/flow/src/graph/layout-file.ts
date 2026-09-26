/** 配置ファイルの読み書き（dagre に依存しないので vite.config からも使う）。 */

export interface XY {
  x: number;
  y: number;
}

/**
 * 手動配置位置のファイル（`layouts/*.layout.json`）。
 * スキーマ v0 には置き場所が無いので、プロジェクトファイルとは別に持つ。
 */
export interface LayoutFile {
  version: 1;
  /** 画面・ダイアログ id → 左上の座標 */
  positions: Record<string, XY>;
}

export const EMPTY_LAYOUT: LayoutFile = { version: 1, positions: {} };

/** 決定的に書き出す（id 順、座標は整数）。 */
export function serializeLayout(positions: Record<string, XY>): string {
  const sorted: Record<string, XY> = {};
  for (const id of Object.keys(positions).sort()) {
    const p = positions[id]!;
    sorted[id] = { x: Math.round(p.x), y: Math.round(p.y) };
  }
  const file: LayoutFile = { version: 1, positions: sorted };
  return `${JSON.stringify(file, null, 2)}\n`;
}

export function parseLayout(text: string): LayoutFile {
  const raw = JSON.parse(text) as Partial<LayoutFile>;
  if (raw.version !== 1 || typeof raw.positions !== "object" || raw.positions === null) {
    throw new Error("配置ファイルの形式が違います");
  }
  return { version: 1, positions: raw.positions };
}
