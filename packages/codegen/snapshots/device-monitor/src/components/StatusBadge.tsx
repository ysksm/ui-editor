import type { DeviceStatus } from "../model";
import { Text } from "../ui/Text";
import styles from "./StatusBadge.module.css";

export interface StatusBadgeProps {
  status: DeviceStatus;
}

export function StatusBadge(props: StatusBadgeProps) {
  return (
    <Text
      className={styles.badge}
      style={{
        backgroundColor: { online: "#2e7d32", offline: "#757575", warning: "#ed6c02" }[
          props.status
        ],
      }}
    >
      {{ online: "オンライン", offline: "オフライン", warning: "警告" }[props.status]}
    </Text>
  );
}
