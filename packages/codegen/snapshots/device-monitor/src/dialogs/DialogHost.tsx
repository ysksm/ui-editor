import { useAppStore } from "../store/appStore";
import { AlarmDetailDialog } from "./AlarmDetailDialog";
import { SaveConfirmDialog } from "./SaveConfirmDialog";

/** 開いているダイアログ（同時に 1 つ）を描画する。開閉はストアの openDialog / closeDialog で行う。 */
export function DialogHost() {
  const dialog = useAppStore((store) => store.dialog);
  const closeDialog = useAppStore((store) => store.closeDialog);

  switch (dialog?.id) {
    case "saveConfirm":
      return <SaveConfirmDialog open onClose={closeDialog} params={dialog.params} />;
    case "alarmDetail":
      return <AlarmDetailDialog open onClose={closeDialog} params={dialog.params} />;
    default:
      return null;
  }
}
