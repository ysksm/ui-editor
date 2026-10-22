import type { CSSProperties } from "react";
import { text } from "../runtime/values";
import { cx } from "./cx";
import styles from "./ui.module.css";

export interface CheckboxProps {
  label?: unknown;
  checked?: unknown;
  disabled?: unknown;
  className?: string;
  style?: CSSProperties;
  /** チェックが変わったとき。値は `event.value`。 */
  onChange?: (event: { value: boolean }) => void;
}

/** チェックボックス。 */
export function Checkbox({ label, checked, disabled, className, style, onChange }: CheckboxProps) {
  return (
    <label className={cx(styles.check, className)} style={style}>
      <input
        type="checkbox"
        checked={checked === true}
        disabled={Boolean(disabled)}
        readOnly={!onChange}
        onChange={(e) => onChange?.({ value: e.target.checked })}
      />
      <span>{text(label)}</span>
    </label>
  );
}
