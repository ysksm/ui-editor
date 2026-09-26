import { useNavigate } from "react-router";
import { AlarmRow } from "../components/AlarmRow";
import { MetricCard } from "../components/MetricCard";
import { StatusBadge } from "../components/StatusBadge";
import { paths } from "../paths";
import { useAppStore } from "../store/appStore";
import { Button } from "../ui/Button";
import { Text } from "../ui/Text";
import styles from "./DashboardScreen.module.css";

export function DashboardScreen() {
  const navigate = useNavigate();
  const data = useAppStore((store) => store.data);
  const openDialog = useAppStore((store) => store.openDialog);

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <Text variant="title">ダッシュボード</Text>
        <Button variant="secondary" onClick={() => navigate(paths.devices())}>
          機器一覧へ
        </Button>
      </div>
      <div className={styles.statusSection}>
        <Text variant="caption">機器ステータス</Text>
        <div className={styles.statusList}>
          {data.devices.map((device) => (
            <div
              key={device.id}
              className={styles.deviceCard}
              onClick={() => navigate(paths.deviceSettings({ deviceId: device.id }))}
            >
              <Text>{device.name}</Text>
              <StatusBadge status={device.status} />
            </div>
          ))}
        </div>
      </div>
      <div className={styles.metricSection}>
        <MetricCard
          value={Math.max(
            ...data.devices.map(
              (d) => data.metrics.filter((m) => m.deviceId === d.id).at(-1)?.temperature ?? 0,
            ),
          )}
          label="最高温度"
          unit="℃"
        />
        <MetricCard
          value={Math.max(
            ...data.devices.map(
              (d) => data.metrics.filter((m) => m.deviceId === d.id).at(-1)?.cpu ?? 0,
            ),
          )}
          label="最大 CPU 使用率"
          unit="%"
        />
        <MetricCard
          value={Math.round(
            data.devices.reduce(
              (sum, d) =>
                sum + (data.metrics.filter((m) => m.deviceId === d.id).at(-1)?.trafficMbps ?? 0),
              0,
            ),
          )}
          label="通信量（合計）"
          unit="Mbps"
        />
      </div>
      <div className={styles.alarmSection}>
        <Text variant="caption">最新アラーム</Text>
        {data.alarms
          .toSorted((a, b) => b.occurredAt.localeCompare(a.occurredAt))
          .slice(0, 5)
          .map((alarm) => (
            <AlarmRow
              key={alarm.id}
              alarm={alarm}
              deviceName={data.devices.find((d) => d.id === alarm.deviceId)?.name ?? alarm.deviceId}
              onClick={() => openDialog({ id: "alarmDetail", params: { alarmId: alarm.id } })}
            />
          ))}
      </div>
    </div>
  );
}
