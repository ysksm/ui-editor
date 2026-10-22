import type { ReactNode } from "react";
import styles from "./ui.module.css";

export interface DialogProps {
  title: string;
  /** × を押したとき（結果 cancel で閉じる）。 */
  onCancel?: () => void;
  children?: ReactNode;
}

/** ダイアログ（画面の上に重ねる）。 */
export function Dialog({ title, onCancel, children }: DialogProps) {
  return (
    <div className={styles.backdrop}>
      <div className={styles.dialog} role="dialog" aria-modal="true" aria-label={title}>
        <div className={styles.dialogTitle}>
          <span>{title}</span>
          {onCancel && (
            <button type="button" className={styles.close} aria-label="閉じる" onClick={onCancel}>
              ×
            </button>
          )}
        </div>
        <div className={styles.dialogBody}>{children}</div>
      </div>
    </div>
  );
}
