import type { CSSProperties } from "react";
import { present, text } from "../runtime/values";
import { cx } from "./cx";
import styles from "./ui.module.css";

export interface ButtonProps {
  label?: unknown;
  /** `primary`・`secondary`（既定）・`danger`。 */
  variant?: string;
  disabled?: unknown;
  /**
   * 押すのに要る値（選択中のレコードなど）。requiresMessage と一緒に渡すと、
   * requires が無い（undefined・null・false・空文字）あいだは押せず、requiresMessage を出す。
   */
  requires?: unknown;
  requiresMessage?: string;
  className?: string;
  style?: CSSProperties;
  onClick?: () => void;
}

/** ボタン。 */
export function Button({
  label,
  variant = "secondary",
  disabled,
  requires,
  requiresMessage,
  className,
  style,
  onClick,
}: ButtonProps) {
  const blocked = requiresMessage !== undefined && !present(requires);
  return (
    <button
      type="button"
      className={cx(styles.button, styles[variant], className)}
      style={style}
      disabled={Boolean(disabled) || blocked}
      title={blocked ? requiresMessage : undefined}
      onClick={(e) => {
        e.stopPropagation();
        onClick?.();
      }}
    >
      {text(label) || "ボタン"}
    </button>
  );
}
