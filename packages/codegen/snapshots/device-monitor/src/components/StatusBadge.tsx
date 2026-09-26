import type { DeviceStatus } from "../model";
import { Text } from "../ui/Text";
import styles from "./StatusBadge.module.css";

export interface StatusBadgeProps {
  status: DeviceStatus;
}

export function StatusBadge(props: StatusBadgeProps) {
  return (
    <Text className={styles.badge}>
      {"{{ ({ online: 'オンライン', offline: 'オフライン', warning: '警告' })[props.status] }}"}
    </Text>
  );
}
