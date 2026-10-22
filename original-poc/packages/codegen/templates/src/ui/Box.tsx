import type { CSSProperties, ReactNode } from "react";
import { cx } from "./cx";
import styles from "./ui.module.css";

export interface BoxProps {
  /** `row`（横）か `column`（縦、既定）。 */
  direction?: string;
  /** 間隔（数値は px）。 */
  gap?: number | string;
  className?: string;
  style?: CSSProperties;
  onClick?: () => void;
  children?: ReactNode;
}

/** 部品を縦・横に並べる入れ物。 */
export function Box({ direction, gap = 8, className, style, onClick, children }: BoxProps) {
  return (
    <div
      className={cx(styles.box, className)}
      style={{ flexDirection: direction === "row" ? "row" : "column", gap, ...style }}
      onClick={
        onClick
          ? (e) => {
              e.stopPropagation();
              onClick();
            }
          : undefined
      }
    >
      {children}
    </div>
  );
}
