import type { CSSProperties } from "react";
import { text } from "../runtime/values";
import { cx } from "./cx";
import styles from "./ui.module.css";

export interface TextProps {
  text?: unknown;
  /** `title`（見出し）・`body`（既定）・`caption`（補足）。 */
  variant?: string;
  className?: string;
  style?: CSSProperties;
  onClick?: () => void;
}

/** 文字。 */
export function Text({ text: value, variant = "body", className, style, onClick }: TextProps) {
  const Tag = variant === "title" ? "h2" : variant === "caption" ? "small" : "p";
  return (
    <Tag className={cx(styles.text, styles[variant], className)} style={style} onClick={onClick}>
      {text(value)}
    </Tag>
  );
}
