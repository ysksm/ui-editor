import { cx } from "./cx";
import styles from "./ui.module.css";

export interface NoticeBarProps {
  level: "info" | "error";
  message: string;
  onDismiss?: () => void;
}

/** 画面の上に出すお知らせ（データの変更に失敗したときなど）。 */
export function NoticeBar({ level, message, onDismiss }: NoticeBarProps) {
  return (
    <div className={cx(styles.notice, styles[level])} role={level === "error" ? "alert" : "status"}>
      <span>{message}</span>
      {onDismiss && (
        <button
          type="button"
          className={styles.close}
          aria-label="お知らせを閉じる"
          onClick={onDismiss}
        >
          ×
        </button>
      )}
    </div>
  );
}
