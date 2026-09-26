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

export function SaveConfirmDialog({ open, onClose }: SaveConfirmDialogProps) {
  return (
    <Dialog open={open} onClose={onClose} label="保存確認">
      <div className={styles.body}>
        <Text>設定を保存しますか？</Text>
        <div className={styles.buttons}>
          <Button variant="secondary">キャンセル</Button>
          <Button variant="primary">OK</Button>
        </div>
      </div>
    </Dialog>
  );
}
