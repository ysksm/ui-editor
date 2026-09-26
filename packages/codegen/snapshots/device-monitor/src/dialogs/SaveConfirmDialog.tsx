import { useNavigate } from "react-router";
import { paths } from "../paths";
import { useAppStore } from "../store/appStore";
import { Button } from "../ui/Button";
import { Dialog } from "../ui/Dialog";
import { Text } from "../ui/Text";
import styles from "./SaveConfirmDialog.module.css";

export interface SaveConfirmDialogParams {
  deviceId: string;
}

export interface SaveConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  params: SaveConfirmDialogParams;
}

export function SaveConfirmDialog({ open, onClose, params }: SaveConfirmDialogProps) {
  const navigate = useNavigate();
  const state = useAppStore((store) => store.state);
  const updateData = useAppStore((store) => store.updateData);

  return (
    <Dialog open={open} onClose={onClose} label="保存確認">
      <div className={styles.body}>
        <Text>設定を保存しますか？</Text>
        <div className={styles.buttons}>
          <Button variant="secondary" onClick={() => onClose()}>
            キャンセル
          </Button>
          <Button
            variant="primary"
            onClick={() => {
              updateData(
                "deviceSettings",
                { deviceId: params.deviceId },
                {
                  network: state.draftSettings.network,
                  pollingIntervalSec: state.draftSettings.pollingIntervalSec,
                  thresholds: state.draftSettings.thresholds,
                },
              );
              updateData(
                "devices",
                { id: params.deviceId },
                { ipAddress: state.draftSettings.network.ip },
              );
              onClose();
              navigate(paths.devices());
            }}
          >
            OK
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
