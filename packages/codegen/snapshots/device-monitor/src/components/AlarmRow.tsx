import type { Alarm } from "../model";
import { Text } from "../ui/Text";
import styles from "./AlarmRow.module.css";

export interface AlarmRowProps {
  alarm: Alarm;
  deviceName: string;
}

export function AlarmRow(props: AlarmRowProps) {
  return (
    <div className={styles.row}>
      <Text className={styles.level}>{"{{ props.alarm.level.toUpperCase() }}"}</Text>
      <Text className={styles.message}>{"{{ props.alarm.message }}"}</Text>
      <Text variant="caption">{"{{ props.deviceName }}"}</Text>
      <Text variant="caption">{"{{ props.alarm.occurredAt.slice(0, 16).replace('T', ' ') }}"}</Text>
      <Text variant="caption">確認済み</Text>
    </div>
  );
}
