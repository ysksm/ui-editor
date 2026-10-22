/**
 * IE 記法の線端。線は左から右へ来て、右端（refX）がエンティティの枠に当たる向きで描く。
 * orient="auto-start-reverse" なので、始点（markerStart）に付けると向きが反転する。
 */
export function IeMarkers() {
  const common = {
    viewBox: "0 0 24 20",
    markerWidth: 24,
    markerHeight: 20,
    refX: 24,
    refY: 10,
    orient: "auto-start-reverse",
    markerUnits: "userSpaceOnUse",
  } as const;
  const stroke = { stroke: "var(--er-line, #475569)", strokeWidth: 1.5, fill: "none" };
  return (
    <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden="true">
      <defs>
        {/* 1（必須の 1）: 縦線 2 本 */}
        <marker id="ie-one" {...common}>
          <path d="M14 3 V17 M19 3 V17" {...stroke} />
        </marker>
        {/* 0 か 1: 丸と縦線 */}
        <marker id="ie-zero-one" {...common}>
          <circle cx="9" cy="10" r="4" {...stroke} fill="var(--paper, #fff)" />
          <path d="M19 3 V17" {...stroke} />
        </marker>
        {/* 0 以上: 丸と鳥の足 */}
        <marker id="ie-zero-many" {...common}>
          <circle cx="7" cy="10" r="4" {...stroke} fill="var(--paper, #fff)" />
          <path d="M12 10 L24 3 M12 10 L24 17 M12 10 H24" {...stroke} />
        </marker>
      </defs>
    </svg>
  );
}
