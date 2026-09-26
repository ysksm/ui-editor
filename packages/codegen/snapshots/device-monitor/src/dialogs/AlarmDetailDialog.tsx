import { useAppStore } from "../store/appStore";
import { Button } from "../ui/Button";
import { Dialog } from "../ui/Dialog";
import { Text } from "../ui/Text";
import styles from "./AlarmDetailDialog.module.css";

export interface AlarmDetailDialogParams {
  alarmId: string;
}

export interface AlarmDetailDialogProps {
  open: boolean;
  onClose: () => void;
  params: AlarmDetailDialogParams;
}

export function AlarmDetailDialog({ open, onClose, params }: AlarmDetailDialogProps) {
  const data = useAppStore((store) => store.data);
  const updateData = useAppStore((store) => store.updateData);

  return (
    <Dialog open={open} onClose={onClose} label="アラーム詳細">
      <div className={styles.body}>
        <Text variant="caption">
          {data.alarms.find((a) => a.id === params.alarmId)?.level.toUpperCase()}
        </Text>
        <Text variant="title">{data.alarms.find((a) => a.id === params.alarmId)?.message}</Text>
        <Text>
          {"機器: "}
          {
            data.devices.find(
              (d) => d.id === data.alarms.find((a) => a.id === params.alarmId)?.deviceId,
            )?.name
          }
        </Text>
        <Text>
          {"発生日時: "}
          {data.alarms
            .find((a) => a.id === params.alarmId)
            ?.occurredAt.slice(0, 19)
            .replace("T", " ")}
        </Text>
        <div className={styles.buttons}>
          <Button variant="secondary" onClick={() => onClose()}>
            閉じる
          </Button>
          {!data.alarms.find((a) => a.id === params.alarmId)?.acknowledged && (
            <Button
              variant="primary"
              onClick={() => {
                updateData("alarms", { id: params.alarmId }, { acknowledged: true });
                onClose();
              }}
            >
              確認済みにする
            </Button>
          )}
        </div>
      </div>
    </Dialog>
  );
}
