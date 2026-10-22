import { useEffect, useState, type InputHTMLAttributes } from "react";

/**
 * 入力中はローカルに持ち、確定（フォーカスが外れる・Enter）したときだけ `onCommit` を呼ぶ入力欄。
 * 編集のたびに履歴を積まないため。`validate` が理由を返したら確定せず、元の値に戻す。
 */
export function CommitInput({
  value,
  onCommit,
  validate,
  className,
  ...rest
}: {
  value: string;
  onCommit: (value: string) => void;
  validate?: (value: string) => string | undefined;
} & Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "onBlur">) {
  const [draft, setDraft] = useState(value);
  const [error, setError] = useState<string | undefined>();
  useEffect(() => setDraft(value), [value]);
  const commit = () => {
    if (draft === value) {
      setError(undefined);
      return;
    }
    const problem = validate?.(draft);
    if (problem) {
      setError(problem);
      setDraft(value);
      return;
    }
    setError(undefined);
    onCommit(draft);
  };
  return (
    <span className={className ? `commit-input ${className}` : "commit-input"}>
      <input
        {...rest}
        value={draft}
        aria-invalid={error ? true : undefined}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          if (e.key === "Escape") {
            setDraft(value);
            setError(undefined);
          }
          rest.onKeyDown?.(e);
        }}
      />
      {error && <span className="field-error">{error}</span>}
    </span>
  );
}
