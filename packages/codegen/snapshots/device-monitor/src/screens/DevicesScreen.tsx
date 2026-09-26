import { useAppStore } from "../store/appStore";
import { Button } from "../ui/Button";
import { Table } from "../ui/Table";
import { Text } from "../ui/Text";
import styles from "./DevicesScreen.module.css";

export function DevicesScreen() {
  const data = useAppStore((store) => store.data);

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <Text variant="title">機器一覧</Text>
        <Button variant="secondary">ダッシュボードへ</Button>
      </div>
      <Table
        rows={data.devices}
        columns={[
          { header: "名前", value: (row) => row.name },
          { header: "型番", value: (row) => row.model },
          {
            header: "ステータス",
            value: (row) =>
              ({ online: "オンライン", offline: "オフライン", warning: "警告" })[row.status],
          },
          { header: "IP アドレス", value: (row) => row.ipAddress },
          { header: "ファームウェア", value: (row) => row.firmware },
        ]}
      />
    </div>
  );
}
