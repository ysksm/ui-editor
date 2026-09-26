import { Button } from "../ui/Button";
import { Table } from "../ui/Table";
import { Text } from "../ui/Text";
import { unbound } from "../ui/unbound";
import styles from "./DevicesScreen.module.css";

export function DevicesScreen() {
  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <Text variant="title">機器一覧</Text>
        <Button variant="secondary">ダッシュボードへ</Button>
      </div>
      <Table
        rows={[] /* {{ data.devices }} */}
        columns={[
          { header: "名前", value: () => unbound("{{ row.name }}") },
          { header: "型番", value: () => unbound("{{ row.model }}") },
          {
            header: "ステータス",
            value: () =>
              unbound(
                "{{ ({ online: 'オンライン', offline: 'オフライン', warning: '警告' })[row.status] }}",
              ),
          },
          { header: "IP アドレス", value: () => unbound("{{ row.ipAddress }}") },
          { header: "ファームウェア", value: () => unbound("{{ row.firmware }}") },
        ]}
      />
    </div>
  );
}
