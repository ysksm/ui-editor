import { StatusBadge } from "../components/StatusBadge";
import { useAppStore } from "../store/appStore";
import { Button } from "../ui/Button";
import { Checkbox } from "../ui/Checkbox";
import { NumberInput } from "../ui/NumberInput";
import { Text } from "../ui/Text";
import { TextInput } from "../ui/TextInput";
import styles from "./DeviceSettingsScreen.module.css";

export interface DeviceSettingsScreenParams {
  deviceId: string;
}

export function DeviceSettingsScreen({ params }: { params: DeviceSettingsScreenParams }) {
  const data = useAppStore((store) => store.data);
  const state = useAppStore((store) => store.state);

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <Text variant="title">
          {data.devices.find((d) => d.id === params.deviceId)?.name ?? params.deviceId}
          {" の設定"}
        </Text>
        <StatusBadge
          status={data.devices.find((d) => d.id === params.deviceId)?.status ?? "offline"}
        />
      </div>
      {state.draftSettings === null && <Text>機器が見つかりません</Text>}
      {state.draftSettings !== null && (
        <div className={styles.form}>
          <div className={styles.networkSection}>
            <Text variant="caption">ネットワーク</Text>
            <Checkbox checked={state.draftSettings.network.dhcp} label="DHCP を使う" />
            <TextInput
              value={state.draftSettings.network.ip}
              disabled={state.draftSettings.network.dhcp}
              label="IP アドレス"
            />
            <TextInput
              value={state.draftSettings.network.subnet}
              disabled={state.draftSettings.network.dhcp}
              label="サブネットマスク"
            />
            <TextInput
              value={state.draftSettings.network.gateway}
              disabled={state.draftSettings.network.dhcp}
              label="デフォルトゲートウェイ"
            />
          </div>
          <div className={styles.thresholdSection}>
            <Text variant="caption">閾値</Text>
            <NumberInput
              value={state.draftSettings.thresholds.temperatureMax}
              label="温度の上限（℃）"
              max={120}
              min={0}
            />
            <NumberInput
              value={state.draftSettings.thresholds.cpuMax}
              label="CPU 使用率の上限（%）"
              max={100}
              min={0}
            />
          </div>
          <div className={styles.pollingSection}>
            <Text variant="caption">ポーリング</Text>
            <NumberInput
              value={state.draftSettings.pollingIntervalSec}
              label="ポーリング間隔（秒）"
              min={10}
              step={10}
            />
          </div>
          <div className={styles.buttons}>
            <Button variant="secondary">キャンセル</Button>
            <Button variant="primary">保存</Button>
          </div>
        </div>
      )}
    </div>
  );
}
