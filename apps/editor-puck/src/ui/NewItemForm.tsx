import { useState } from "react";

export type NewItemKind = "screen" | "component" | "dialog";

const PLACEHOLDER: Record<NewItemKind, string> = {
  screen: "id（例: report）",
  component: "id（例: TempCard）",
  dialog: "id（例: deleteConfirm）",
};

/** 画面・コンポーネント・ダイアログを新しく作るフォーム。 */
export function NewItemForm(props: {
  onCreate: (kind: NewItemKind, id: string, name: string) => string | undefined;
  onClose: () => void;
}) {
  const [kind, setKind] = useState<NewItemKind>("component");
  const [id, setId] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string>();

  return (
    <form
      className="new-item"
      onSubmit={(e) => {
        e.preventDefault();
        const message = props.onCreate(kind, id.trim(), name.trim());
        setError(message);
      }}
    >
      <select
        aria-label="種類"
        value={kind}
        onChange={(e) => setKind(e.currentTarget.value as NewItemKind)}
      >
        <option value="screen">画面</option>
        <option value="component">コンポーネント</option>
        <option value="dialog">ダイアログ</option>
      </select>
      <input
        aria-label="id"
        value={id}
        placeholder={PLACEHOLDER[kind]}
        onChange={(e) => setId(e.currentTarget.value)}
      />
      <input
        aria-label="表示名"
        value={name}
        placeholder="表示名（例: 温度カード）"
        onChange={(e) => setName(e.currentTarget.value)}
      />
      <button type="submit">作成</button>
      <button type="button" onClick={props.onClose}>
        閉じる
      </button>
      {error && <span className="new-item__error">{error}</span>}
    </form>
  );
}
