import { useEffect } from "react";
import { useNavigate, useParams } from "react-router";
import { StatusBadge } from "../components/StatusBadge";
import { paths } from "../paths";
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

export function DeviceSettingsScreen() {
  // ルートの :deviceId
  const { deviceId = "" } = useParams();
  const params: DeviceSettingsScreenParams = { deviceId };
  const navigate = useNavigate();
  const data = useAppStore((store) => store.data);
  const state = useAppStore((store) => store.state);
  const openDialog = useAppStore((store) => store.openDialog);
  const setState = useAppStore((store) => store.setState);

  // 画面を開いたとき
  useEffect(() => {
    setState(
      "draftSettings",
      structuredClone(data.deviceSettings.find((s) => s.deviceId === params.deviceId) ?? null),
    );
  }, [params.deviceId]);

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <Text variant="title">
          {data.devices.find((d) => d.id === params.deviceId)?.name ?? params.deviceId} の設定
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
            <Checkbox
              checked={state.draftSettings.network.dhcp}
              label="DHCP を使う"
              onChange={(event) => setState("draftSettings.network.dhcp", event.value)}
            />
            <TextInput
              value={state.draftSettings.network.ip}
              disabled={state.draftSettings.network.dhcp}
              label="IP アドレス"
              onChange={(event) => setState("draftSettings.network.ip", event.value)}
            />
            <TextInput
              value={state.draftSettings.network.subnet}
              disabled={state.draftSettings.network.dhcp}
              label="サブネットマスク"
              onChange={(event) => setState("draftSettings.network.subnet", event.value)}
            />
            <TextInput
              value={state.draftSettings.network.gateway}
              disabled={state.draftSettings.network.dhcp}
              label="デフォルトゲートウェイ"
              onChange={(event) => setState("draftSettings.network.gateway", event.value)}
            />
          </div>
          <div className={styles.thresholdSection}>
            <Text variant="caption">閾値</Text>
            <NumberInput
              value={state.draftSettings.thresholds.temperatureMax}
              label="温度の上限（℃）"
              max={120}
              min={0}
              onChange={(event) => setState("draftSettings.thresholds.temperatureMax", event.value)}
            />
            <NumberInput
              value={state.draftSettings.thresholds.cpuMax}
              label="CPU 使用率の上限（%）"
              max={100}
              min={0}
              onChange={(event) => setState("draftSettings.thresholds.cpuMax", event.value)}
            />
          </div>
          <div className={styles.pollingSection}>
            <Text variant="caption">ポーリング</Text>
            <NumberInput
              value={state.draftSettings.pollingIntervalSec}
              label="ポーリング間隔（秒）"
              min={10}
              step={10}
              onChange={(event) => setState("draftSettings.pollingIntervalSec", event.value)}
            />
          </div>
          <div className={styles.buttons}>
            <Button variant="secondary" onClick={() => navigate(paths.devices())}>
              キャンセル
            </Button>
            <Button
              variant="primary"
              onClick={() =>
                openDialog({ id: "saveConfirm", params: { deviceId: params.deviceId } })
              }
            >
              保存
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
