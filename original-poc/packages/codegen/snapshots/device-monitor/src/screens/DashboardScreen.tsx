import { useNavigator } from "../navigation";
import { useDataView } from "../store/hooks";
import { Box } from "../ui/Box";
import { Button } from "../ui/Button";
import { Table } from "../ui/Table";
import { Text } from "../ui/Text";

/** ダッシュボード（/） */
export function DashboardScreen() {
  const data = useDataView();
  const { navigate } = useNavigator();
  return (
    <Box direction="column" gap={16}>
      <Text text="ダッシュボード" variant="title" />
      <Text text="未確認のアラーム" />
      <Table
        rows={data.Alarm.filter((a) => !a.acknowledged)}
        columns={[
          { header: "レベル", value: (row) => row.level },
          { header: "内容", value: (row) => row.message },
          { header: "発生日時", value: (row) => row.occurredAt },
        ]}
      />
      <Button label="機器一覧へ" onClick={() => navigate("devices")} />
    </Box>
  );
}
