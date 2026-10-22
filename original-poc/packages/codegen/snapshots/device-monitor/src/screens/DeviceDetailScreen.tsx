import { useNavigator, useScreenParams } from "../navigation";
import { text } from "../runtime/values";
import { useRecord } from "../store/hooks";
import { openDialog } from "../store/store";
import { Box } from "../ui/Box";
import { Button } from "../ui/Button";
import { Table } from "../ui/Table";
import { Text } from "../ui/Text";

/** 機器詳細（/devices/:deviceId）。機器の詳細 */
export function DeviceDetailScreen() {
  const params = useScreenParams("deviceDetail");
  const record = useRecord("Device", params.deviceId);
  const { navigate } = useNavigator();
  return (
    <Box direction="column" gap={16}>
      <Text text={record?.name} variant="title" />
      <Text text={`型番: ${text(record?.model)}`} />
      <Text text={`状態: ${text(record?.status)}`} />
      <Text text={`IP アドレス: ${text(record?.ipAddress)}`} />
      <Text text="アラーム" />
      <Table
        rows={record?.alarms ?? []}
        columns={[
          { header: "レベル", value: (row) => row.level },
          { header: "内容", value: (row) => row.message },
          { header: "確認済み", value: (row) => row.acknowledged },
        ]}
      />
      <Box direction="row" gap={8}>
        <Button
          label="削除"
          variant="danger"
          onClick={() => openDialog("deviceDelete", { deviceId: params.deviceId })}
        />
        <Button label="一覧へ戻る" variant="secondary" onClick={() => navigate("devices")} />
      </Box>
    </Box>
  );
}
