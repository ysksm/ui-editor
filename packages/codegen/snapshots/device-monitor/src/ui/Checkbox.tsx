import type { CSSProperties } from "react";
import styles from "./ui.module.css";

export interface CheckboxProps {
  checked?: boolean;
  label?: string;
  disabled?: boolean;
  className?: string;
  style?: CSSProperties;
  onChange?: (event: { value: boolean }) => void;
}

/** 組み込みの Checkbox。change イベントの値は `event.value`（真偽値）。 */
export function Checkbox({ checked, label, disabled, className, style, onChange }: CheckboxProps) {
  return (
    <label className={[styles.checkbox, className].filter(Boolean).join(" ")} style={style}>
      <input
        type="checkbox"
        checked={checked ?? false}
        disabled={disabled}
        readOnly={!onChange}
        onChange={(e) => onChange?.({ value: e.target.checked })}
      />
      {label}
    </label>
  );
}
