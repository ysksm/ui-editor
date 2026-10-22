import type { DialogParams } from "../model/types";
import { useNavigator } from "../navigation";
import { text } from "../runtime/values";
import { useRecord } from "../store/hooks";
import { deleteDevice } from "../store/records";
import { closeDialog } from "../store/store";
import { Box } from "../ui/Box";
import { Button } from "../ui/Button";
import { Dialog } from "../ui/Dialog";
import { Text } from "../ui/Text";

/** 削除の確認。機器の確認 */
export function DeviceDeleteDialog({ params }: { params: DialogParams["deviceDelete"] }) {
  const record = useRecord("Device", params.deviceId);
  const { navigate } = useNavigator();
  return (
    <Dialog title="削除の確認" onCancel={() => closeDialog("cancel")}>
      <Box direction="column" gap={12}>
        <Text
          text={`「${text(record?.name)}」を削除しますか？設定・メトリクス・アラームも削除されます。`}
        />
        <Box direction="row" gap={8}>
          <Button
            label="削除する"
            variant="danger"
            onClick={() => {
              if (!deleteDevice({ id: params.deviceId }).ok) return;
              closeDialog("ok");
              navigate("devices");
            }}
          />
          <Button label="キャンセル" variant="secondary" onClick={() => closeDialog("cancel")} />
        </Box>
      </Box>
    </Dialog>
  );
}
