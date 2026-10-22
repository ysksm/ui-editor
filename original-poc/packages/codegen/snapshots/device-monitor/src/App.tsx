import { useDataView } from "./store/hooks";
import { Box } from "./ui/Box";
import { Table } from "./ui/Table";
import { Text } from "./ui/Text";

/** トップ画面（仮）。エンティティごとの件数を出す。 */
export function App() {
  const data = useDataView();
  return (
    <Box gap={12} style={{ padding: 24 }}>
      <Text variant="title" text="機器の設定＆モニタリング" />
      <Table
        rows={[
          { name: "機器（Device）", count: data.Device.length },
          { name: "機器設定（DeviceSettings）", count: data.DeviceSettings.length },
          { name: "メトリクス（Metric）", count: data.Metric.length },
          { name: "アラーム（Alarm）", count: data.Alarm.length },
        ]}
        rowKey={(row) => row.name}
        columns={[
          { header: "エンティティ", value: (row) => row.name },
          { header: "件数", value: (row) => row.count },
        ]}
      />
    </Box>
  );
}
