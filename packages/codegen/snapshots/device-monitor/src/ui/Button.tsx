import type { CSSProperties, ReactNode } from "react";
import styles from "./ui.module.css";

export interface ButtonProps {
  variant?: "primary" | "secondary" | "danger";
  disabled?: boolean;
  className?: string;
  style?: CSSProperties;
  onClick?: () => void;
  children?: ReactNode;
}

/** 組み込みの Button。 */
export function Button({
  variant = "primary",
  disabled,
  className,
  style,
  onClick,
  children,
}: ButtonProps) {
  return (
    <button
      type="button"
      className={[styles.button, styles[variant], className].filter(Boolean).join(" ")}
      style={style}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
