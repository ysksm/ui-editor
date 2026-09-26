import type { CSSProperties, ReactNode } from "react";
import styles from "./ui.module.css";

export interface TextProps {
  variant?: "title" | "body" | "caption";
  className?: string;
  style?: CSSProperties;
  onClick?: () => void;
  children?: ReactNode;
}

const TAGS = { title: "h1", body: "p", caption: "p" } as const;

/** 組み込みの Text。variant で見出し・本文・補足を切り替える。 */
export function Text({ variant = "body", className, style, onClick, children }: TextProps) {
  const Tag = TAGS[variant];
  return (
    <Tag
      className={[styles.text, styles[variant], className].filter(Boolean).join(" ")}
      style={style}
      onClick={onClick}
    >
      {children}
    </Tag>
  );
}
