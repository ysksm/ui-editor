import { AlarmRow } from "../components/AlarmRow";
import { MetricCard } from "../components/MetricCard";
import { StatusBadge } from "../components/StatusBadge";
import { Button } from "../ui/Button";
import { Text } from "../ui/Text";
import { unbound } from "../ui/unbound";
import styles from "./DashboardScreen.module.css";

export function DashboardScreen() {
  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <Text variant="title">ダッシュボード</Text>
        <Button variant="secondary">機器一覧へ</Button>
      </div>
      <div className={styles.statusSection}>
        <Text variant="caption">機器ステータス</Text>
        <div className={styles.statusList}>
          <div className={styles.deviceCard}>
            <Text>{"{{ device.name }}"}</Text>
            <StatusBadge status={unbound("{{ device.status }}")} />
          </div>
        </div>
      </div>
      <div className={styles.metricSection}>
        <MetricCard
          value={unbound(
            "{{ Math.max(...data.devices.map(d => data.metrics.filter(m => m.deviceId === d.id).at(-1)?.temperature ?? 0)) }}",
          )}
          label="最高温度"
          unit="℃"
        />
        <MetricCard
          value={unbound(
            "{{ Math.max(...data.devices.map(d => data.metrics.filter(m => m.deviceId === d.id).at(-1)?.cpu ?? 0)) }}",
          )}
          label="最大 CPU 使用率"
          unit="%"
        />
        <MetricCard
          value={unbound(
            "{{ Math.round(data.devices.reduce((sum, d) => sum + (data.metrics.filter(m => m.deviceId === d.id).at(-1)?.trafficMbps ?? 0), 0)) }}",
          )}
          label="通信量（合計）"
          unit="Mbps"
        />
      </div>
      <div className={styles.alarmSection}>
        <Text variant="caption">最新アラーム</Text>
        <AlarmRow
          alarm={unbound("{{ alarm }}")}
          deviceName={unbound(
            "{{ data.devices.find(d => d.id === alarm.deviceId)?.name ?? alarm.deviceId }}",
          )}
        />
      </div>
    </div>
  );
}
