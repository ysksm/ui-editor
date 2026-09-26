import { createUsePuck } from "@puckeditor/core";
import { useState } from "react";

const usePuck = createUsePuck();

/**
 * Puck のヘッダーに置く「選択中のパーツをコンポーネントにする」操作。
 * Puck の中（ヘッダー）に描くので、usePuck で選択中の item を取れる。
 */
export function ExtractAction(props: {
  onExtract: (nodeId: string, id: string) => string | undefined;
}) {
  const selected = usePuck((s) => s.selectedItem);
  const [id, setId] = useState("");
  const [error, setError] = useState<string>();
  const nodeId = selected ? String(selected.props.id) : undefined;

  return (
    <form
      className="extract"
      onSubmit={(e) => {
        e.preventDefault();
        if (!nodeId) return;
        const message = props.onExtract(nodeId, id.trim());
        setError(message);
        if (!message) setId("");
      }}
    >
      <input
        aria-label="コンポーネント名"
        value={id}
        placeholder="コンポーネント名"
        disabled={!nodeId}
        onChange={(e) => setId(e.currentTarget.value)}
      />
      <button type="submit" disabled={!nodeId || id.trim() === ""}>
        選択をコンポーネント化
      </button>
      {error && <span className="extract__error">{error}</span>}
    </form>
  );
}
