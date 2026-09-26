import type { CSSProperties } from "react";
import styles from "./ui.module.css";

export interface TextInputProps {
  value?: string;
  label?: string;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  style?: CSSProperties;
  onChange?: (event: { value: string }) => void;
}

/** 組み込みの TextInput。change イベントの値は `event.value`（文字列）。 */
export function TextInput({
  value,
  label,
  placeholder,
  disabled,
  className,
  style,
  onChange,
}: TextInputProps) {
  return (
    <label className={[styles.field, className].filter(Boolean).join(" ")} style={style}>
      {label}
      <input
        className={styles.input}
        type="text"
        value={value ?? ""}
        placeholder={placeholder}
        disabled={disabled}
        readOnly={!onChange}
        onChange={(e) => onChange?.({ value: e.target.value })}
      />
    </label>
  );
}
