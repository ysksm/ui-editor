import { useAppStore } from "../store/store";
import { DeviceEditDialog } from "./DeviceEditDialog";
import { DeviceDeleteDialog } from "./DeviceDeleteDialog";

/** 開いているダイアログを重ねて出す（最後が最前面）。 */
export function DialogHost() {
  const dialogs = useAppStore((s) => s.dialogs);
  return (
    <>
      {dialogs.map((dialog) => {
        switch (dialog.name) {
          case "deviceEdit":
            return <DeviceEditDialog key={dialog.key} params={dialog.params} />;
          case "deviceDelete":
            return <DeviceDeleteDialog key={dialog.key} params={dialog.params} />;
        }
      })}
    </>
  );
}
