import { useEditor } from "../state/store";

/** 画面内の確認ダイアログ（ブラウザの confirm は自動操作を止めてしまうので使わない）。 */
export function ConfirmDialog() {
  const confirm = useEditor((s) => s.confirm);
  const close = useEditor((s) => s.closeConfirm);
  if (!confirm) return null;
  return (
    <div className="modal-backdrop">
      <div className="modal" role="alertdialog" aria-modal="true" aria-label="確認">
        <p>{confirm.text}</p>
        <div className="modal-actions">
          <button onClick={close}>やめる</button>
          <button
            className="danger"
            onClick={() => {
              close();
              confirm.onOk();
            }}
          >
            {confirm.okLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
