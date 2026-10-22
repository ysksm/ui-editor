import { useEditor } from "../state/store";

export function NoticeBar() {
  const notice = useEditor((s) => s.notice);
  const setNotice = useEditor((s) => s.setNotice);
  if (!notice) return null;
  return (
    <div
      className={`notice notice-${notice.kind}`}
      role={notice.kind === "error" ? "alert" : "status"}
    >
      <span className="notice-text">{notice.text}</span>
      <button className="link" onClick={() => setNotice(null)} aria-label="閉じる">
        ×
      </button>
    </div>
  );
}
