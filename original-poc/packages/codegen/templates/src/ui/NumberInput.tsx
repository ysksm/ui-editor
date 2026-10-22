import type { CSSProperties } from "react";
import { text } from "../runtime/values";
import { cx } from "./cx";
import styles from "./ui.module.css";

export interface NumberInputProps {
  label?: unknown;
  value?: unknown;
  error?: unknown;
  disabled?: unknown;
  className?: string;
  style?: CSSProperties;
  /** 入力が変わったとき。値は `event.value`（空なら null）。 */
  onChange?: (event: { value: number | null }) => void;
}

/** 数値の入力欄。 */
export function NumberInput({
  label,
  value,
  error,
  disabled,
  className,
  style,
  onChange,
}: NumberInputProps) {
  return (
    <label className={cx(styles.field, className)} style={style}>
      <span className={styles.label}>{text(label)}</span>
      <input
        type="number"
        value={value === null || value === undefined ? "" : String(value)}
        disabled={Boolean(disabled)}
        readOnly={!onChange}
        aria-invalid={error ? true : undefined}
        onChange={(e) =>
          onChange?.({ value: e.target.value === "" ? null : Number(e.target.value) })
        }
      />
      {error ? <span className={styles.error}>{text(error)}</span> : null}
    </label>
  );
}
