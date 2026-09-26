import { useEffect, type ReactNode } from "react";
import styles from "./ui.module.css";

export interface DialogProps {
  open: boolean;
  onClose: () => void;
  /** 読み上げ用の名前。 */
  label: string;
  children?: ReactNode;
}

/** ダイアログの枠。背景のクリックと Esc キーで onClose を呼ぶ。 */
export function Dialog({ open, onClose, label, children }: DialogProps) {
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className={styles.backdrop} onClick={onClose}>
      <div
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}
