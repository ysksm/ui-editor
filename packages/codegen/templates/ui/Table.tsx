import type { CSSProperties, ReactNode } from "react";
import styles from "./ui.module.css";

export interface TableColumn<Row> {
  header: string;
  value: (row: Row) => ReactNode;
}

export interface TableProps<Row> {
  rows: Row[];
  columns: TableColumn<Row>[];
  className?: string;
  style?: CSSProperties;
  onRowClick?: (event: { row: Row }) => void;
}

/** 組み込みの Table。rowClick イベントの値は `event.row`。 */
export function Table<Row>({ rows, columns, className, style, onRowClick }: TableProps<Row>) {
  return (
    <table className={[styles.table, className].filter(Boolean).join(" ")} style={style}>
      <thead>
        <tr>
          {columns.map((column) => (
            <th key={column.header}>{column.header}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, index) => (
          <tr
            key={index}
            className={onRowClick ? styles.clickableRow : undefined}
            onClick={() => onRowClick?.({ row })}
          >
            {columns.map((column) => (
              <td key={column.header}>{column.value(row)}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
