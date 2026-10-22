import type { InputHTMLAttributes } from "react";
import { CommitInput } from "./CommitInput";

/**
 * バインディング（`{{ 式 }}`）を入れる欄。`candidates` を datalist にして、ブラウザの補完で候補を出す（FR-UI-02）。
 * 同じ画面の欄で共通の datalist を使うので、`listId` には BindingCandidates の id を渡す。
 */
export function BindingInput({
  value,
  onCommit,
  listId,
  ...rest
}: {
  value: string;
  onCommit: (value: string) => void;
  listId: string;
} & Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "onBlur" | "list">) {
  return (
    <CommitInput
      {...rest}
      className="binding-input"
      list={listId}
      value={value}
      onCommit={onCommit}
    />
  );
}

export function BindingCandidates({
  id,
  candidates,
}: {
  id: string;
  candidates: readonly string[];
}) {
  return (
    <datalist id={id}>
      {candidates.map((c) => (
        <option key={c} value={c} />
      ))}
    </datalist>
  );
}
