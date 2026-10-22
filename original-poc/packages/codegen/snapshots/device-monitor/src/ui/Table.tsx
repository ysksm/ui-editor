import type { CSSProperties } from "react";
import { text } from "../runtime/values";
import { cx } from "./cx";
import styles from "./ui.module.css";

export interface TableColumn<Row> {
  header: unknown;
  value: (row: Row, index: number) => unknown;
}

export interface TableProps<Row> {
  rows: readonly Row[];
  /** 列。省略すると最初の行の項目（入れ子でないもの）を並べる。 */
  columns?: readonly TableColumn<Row>[];
  /** 行の key と選択の判定に使う値（既定は `row.id`）。 */
  rowKey?: (row: Row) => unknown;
  /** 行を選ぶ欄（ラジオボタン）を出す。 */
  selectable?: boolean;
  /** 選択中の行の key。 */
  selectedKey?: unknown;
  className?: string;
  style?: CSSProperties;
  onRowClick?: (event: { row: Row }, index: number) => void;
  onRowSelect?: (event: { row: Row }, index: number) => void;
}

/** 表。行を押すと onRowClick、選ぶ欄で onRowSelect（値は `event.row`）。 */
export function Table<Row>({
  rows,
  columns,
  rowKey,
  selectable = false,
  selectedKey,
  className,
  style,
  onRowClick,
  onRowSelect,
}: TableProps<Row>) {
  const keyOf = (row: Row, index: number) =>
    (rowKey ? rowKey(row) : (row as { id?: unknown } | null)?.id) ?? index;
  const shown = columns ?? defaultColumns(rows);
  return (
    <div className={cx(styles.tableWrap, className)} style={style}>
      <table className={styles.table}>
        <thead>
          <tr>
            {selectable && <th aria-label="選択" />}
            {shown.map((c, i) => (
              <th key={i}>{text(c.header)}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td colSpan={shown.length + (selectable ? 1 : 0)} className={styles.empty}>
                データがありません
              </td>
            </tr>
          )}
          {rows.map((row, index) => {
            const key = keyOf(row, index);
            const selected =
              selectedKey !== undefined && selectedKey !== null && key === selectedKey;
            return (
              <tr
                key={String(key)}
                className={cx(selected && styles.selected)}
                onClick={() => onRowClick?.({ row }, index)}
              >
                {selectable && (
                  <td onClick={(e) => e.stopPropagation()}>
                    <input
                      type="radio"
                      aria-label={`${String(key)} を選ぶ`}
                      checked={selected}
                      onChange={() => onRowSelect?.({ row }, index)}
                    />
                  </td>
                )}
                {shown.map((c, i) => (
                  <td key={i}>{cell(c.value(row, index))}</td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function defaultColumns<Row>(rows: readonly Row[]): TableColumn<Row>[] {
  const first = rows[0] as Record<string, unknown> | undefined;
  return Object.keys(first ?? {})
    .filter((k) => typeof first?.[k] !== "object")
    .map((k) => ({ header: k, value: (row) => (row as Record<string, unknown>)[k] }));
}

function cell(value: unknown): string {
  if (value === true) return "✓";
  if (value === false) return "—";
  return text(value);
}
