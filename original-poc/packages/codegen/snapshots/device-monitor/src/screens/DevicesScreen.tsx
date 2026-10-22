import { useNavigator } from "../navigation";
import { present } from "../runtime/values";
import { useDataView, useUiState } from "../store/hooks";
import { openDialog, select } from "../store/store";
import { Box } from "../ui/Box";
import { Button } from "../ui/Button";
import { Table } from "../ui/Table";
import { Text } from "../ui/Text";

/** 機器一覧（/devices）。機器の一覧 */
export function DevicesScreen() {
  const data = useDataView();
  const state = useUiState();
  const { navigate } = useNavigator();
  return (
    <Box direction="column" gap={16}>
      <Text text="機器一覧" variant="title" />
      <Box direction="row" gap={8}>
        <Button
          label="編集"
          requires={state.selection.Device}
          requiresMessage="機器を選ぶと押せます"
          onClick={() => {
            if (!present(state.selection.Device)) return;
            openDialog("deviceEdit", { deviceId: state.selection.Device?.id });
          }}
        />
        <Button
          label="ダッシュボードへ"
          variant="secondary"
          onClick={() => navigate("dashboard")}
        />
      </Box>
      <Table
        rows={data.Device}
        rowKey={(row) => row.id}
        selectedKey={state.selection.Device?.id}
        selectable
        columns={[
          { header: "名前", value: (row) => row.name },
          { header: "型番", value: (row) => row.model },
          { header: "状態", value: (row) => row.status },
          { header: "IP アドレス", value: (row) => row.ipAddress },
        ]}
        onRowClick={(event) => navigate("deviceDetail", { deviceId: event.row.id })}
        onRowSelect={(event) => select("Device", event.row.id)}
      />
    </Box>
  );
}
