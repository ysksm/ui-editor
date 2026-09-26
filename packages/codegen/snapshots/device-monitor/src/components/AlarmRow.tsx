import type { Alarm } from "../model";
import { Text } from "../ui/Text";
import styles from "./AlarmRow.module.css";

export interface AlarmRowProps {
  alarm: Alarm;
  deviceName: string;
  onClick?: () => void;
}

export function AlarmRow(props: AlarmRowProps) {
  return (
    <div className={styles.row} onClick={props.onClick}>
      <Text
        className={styles.level}
        style={{ color: { info: "#0288d1", warn: "#ed6c02", error: "#d32f2f" }[props.alarm.level] }}
      >
        {props.alarm.level.toUpperCase()}
      </Text>
      <Text className={styles.message}>{props.alarm.message}</Text>
      <Text variant="caption">{props.deviceName}</Text>
      <Text variant="caption">{props.alarm.occurredAt.slice(0, 16).replace("T", " ")}</Text>
      {props.alarm.acknowledged && <Text variant="caption">確認済み</Text>}
    </div>
  );
}
