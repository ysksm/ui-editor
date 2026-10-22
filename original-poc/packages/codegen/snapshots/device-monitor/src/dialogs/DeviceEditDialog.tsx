import type { DialogParams } from "../model/types";
import { useForm } from "../store/form";
import { closeDialog } from "../store/store";
import { Box } from "../ui/Box";
import { Button } from "../ui/Button";
import { Dialog } from "../ui/Dialog";
import { Select } from "../ui/Select";
import { Text } from "../ui/Text";
import { TextInput } from "../ui/TextInput";

/** 機器の編集。機器のフォーム */
export function DeviceEditDialog({ params }: { params: DialogParams["deviceEdit"] }) {
  const form = useForm("Device", { recordId: params.deviceId });
  const { draft, errors } = form;
  return (
    <Dialog title="機器の編集" onCancel={() => closeDialog("cancel")}>
      <Box direction="column" gap={12}>
        <Text text="機器の編集" variant="title" />
        <TextInput
          label="名前"
          value={draft.name}
          error={errors.name}
          onChange={(event) => form.setDraft("name", event.value)}
        />
        <TextInput
          label="型番"
          value={draft.model}
          error={errors.model}
          onChange={(event) => form.setDraft("model", event.value)}
        />
        <Select
          label="状態"
          value={draft.status}
          options={[
            { value: "online", label: "online" },
            { value: "offline", label: "offline" },
            { value: "warning", label: "warning" },
          ]}
          error={errors.status}
          onChange={(event) => form.setDraft("status", event.value)}
        />
        <TextInput
          label="IP アドレス"
          value={draft.ipAddress}
          error={errors.ipAddress}
          onChange={(event) => form.setDraft("ipAddress", event.value)}
        />
        <Box direction="row" gap={8}>
          <Button
            label="保存"
            variant="primary"
            onClick={() => {
              if (!form.saveDraft()) return;
              closeDialog("ok");
            }}
          />
          <Button label="キャンセル" variant="secondary" onClick={() => closeDialog("cancel")} />
        </Box>
      </Box>
    </Dialog>
  );
}
