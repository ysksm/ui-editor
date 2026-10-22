import { Fragment } from "react";
import { useLocation, useOutlet } from "react-router";
import { DialogHost } from "./dialogs/DialogHost";
import { dismissNotice, useAppStore } from "./store/store";
import { NoticeBar } from "./ui/NoticeBar";

/**
 * 画面の枠: お知らせ・今の画面・開いているダイアログ。
 * 画面は移るたびに作り直す（location.key）ので、同じ画面への移動でも下書きと mount はやり直す。
 */
export function Layout() {
  const location = useLocation();
  const outlet = useOutlet();
  const notice = useAppStore((s) => s.notice);
  return (
    <main className="page">
      {notice && (
        <NoticeBar level={notice.level} message={notice.message} onDismiss={dismissNotice} />
      )}
      <Fragment key={location.key}>{outlet}</Fragment>
      <DialogHost />
    </main>
  );
}
