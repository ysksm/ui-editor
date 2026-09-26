import type { CSSProperties } from "react";
import styles from "./ui.module.css";

export interface NumberInputProps {
  value?: number;
  label?: string;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
  className?: string;
  style?: CSSProperties;
  onChange?: (event: { value: number }) => void;
}

/** 組み込みの NumberInput。change イベントの値は `event.value`（数値）。 */
export function NumberInput({
  value,
  label,
  min,
  max,
  step,
  disabled,
  className,
  style,
  onChange,
}: NumberInputProps) {
  return (
    <label className={[styles.field, className].filter(Boolean).join(" ")} style={style}>
      {label}
      <input
        className={styles.input}
        type="number"
        value={value ?? ""}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        readOnly={!onChange}
        onChange={(e) => onChange?.({ value: e.target.valueAsNumber })}
      />
    </label>
  );
}
