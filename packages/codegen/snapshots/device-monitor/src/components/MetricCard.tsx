import { Text } from "../ui/Text";
import styles from "./MetricCard.module.css";

export interface MetricCardProps {
  value: number;
  label: string;
  unit?: string;
}

export function MetricCard(input: MetricCardProps) {
  const props = { unit: "", ...input };
  return (
    <div className={styles.card}>
      <Text variant="caption">{props.label}</Text>
      <Text variant="title">
        {props.value} {props.unit}
      </Text>
    </div>
  );
}
