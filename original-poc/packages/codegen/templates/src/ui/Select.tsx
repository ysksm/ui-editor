import type { CSSProperties } from "react";
import { text } from "../runtime/values";
import { cx } from "./cx";
import styles from "./ui.module.css";

export interface SelectOption {
  value?: unknown;
  label?: unknown;
}

export interface SelectProps {
  label?: unknown;
  value?: unknown;
  options?: readonly SelectOption[];
  error?: unknown;
  disabled?: unknown;
  className?: string;
  style?: CSSProperties;
  /** 選んだとき。値は `event.value`（未選択なら null）。 */
  onChange?: (event: { value: string | null }) => void;
}

/** 選択肢から 1 つ選ぶ欄。 */
export function Select({
  label,
  value,
  options = [],
  error,
  disabled,
  className,
  style,
  onChange,
}: SelectProps) {
  return (
    <label className={cx(styles.field, className)} style={style}>
      <span className={styles.label}>{text(label)}</span>
      <select
        value={value === null || value === undefined ? "" : String(value)}
        disabled={Boolean(disabled)}
        aria-invalid={error ? true : undefined}
        onChange={(e) => onChange?.({ value: e.target.value === "" ? null : e.target.value })}
      >
        <option value="">（選んでください）</option>
        {options.map((o, i) => (
          <option key={i} value={String(o.value)}>
            {text(o.label ?? o.value)}
          </option>
        ))}
      </select>
      {error ? <span className={styles.error}>{text(error)}</span> : null}
    </label>
  );
}
