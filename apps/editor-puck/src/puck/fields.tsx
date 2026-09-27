import { FieldLabel, type CustomField } from "@puckeditor/core";
import type { JsonValue } from "@ui-editor/schema";
import { useState } from "react";
import type { P0Extra } from "../convert/convert.ts";
import { textToValue, valueToText } from "./value-text.ts";

/** 固定値でも `{{ }}` のバインディングでも入れられるテキスト欄。 */
export function valueField(label: string): CustomField<JsonValue | undefined> {
  return {
    type: "custom",
    label,
    render: ({ name, value, onChange, readOnly }) => (
      <FieldLabel label={label} readOnly={readOnly}>
        <input
          className="value-field"
          name={name}
          value={valueToText(value)}
          readOnly={readOnly}
          placeholder="固定値 または {{ 式 }}"
          onChange={(e) => onChange(textToValue(e.currentTarget.value))}
        />
      </FieldLabel>
    ),
  };
}

/** 詳細欄で編集する `_p0` のキー（Puck の欄が無い node の情報）。 */
const DETAIL_KEYS = ["repeat", "visible", "events"] as const;
type Detail = Partial<Record<(typeof DETAIL_KEYS)[number], unknown>>;

function detailText(value: P0Extra | undefined): string {
  const picked: Detail = {};
  for (const key of DETAIL_KEYS) if (value?.[key] !== undefined) picked[key] = value[key];
  return Object.keys(picked).length > 0 ? JSON.stringify(picked, null, 2) : "";
}

function DetailEditor(props: {
  name: string;
  value: P0Extra | undefined;
  onChange: (value: P0Extra | undefined) => void;
  readOnly?: boolean | undefined;
}) {
  // 書きかけ（JSON として不正）の間も入力を保つため、テキストは手元に持つ
  const [text, setText] = useState(() => detailText(props.value));
  const [error, setError] = useState<string>();

  function change(next: string) {
    setText(next);
    let parsed: Detail = {};
    if (next.trim() !== "") {
      try {
        parsed = JSON.parse(next) as Detail;
      } catch (e) {
        setError((e as Error).message);
        return;
      }
      const unknown = Object.keys(parsed).filter(
        (k) => !(DETAIL_KEYS as readonly string[]).includes(k),
      );
      if (
        typeof parsed !== "object" ||
        parsed === null ||
        Array.isArray(parsed) ||
        unknown.length > 0
      ) {
        setError(`使えるキーは ${DETAIL_KEYS.join(" / ")} です`);
        return;
      }
    }
    setError(undefined);
    const rest: P0Extra = { ...props.value };
    for (const key of DETAIL_KEYS) delete rest[key];
    const merged = { ...rest, ...parsed } as P0Extra;
    props.onChange(Object.keys(merged).length > 0 ? merged : undefined);
  }

  return (
    <>
      <textarea
        className="value-field detail-field"
        name={props.name}
        value={text}
        readOnly={props.readOnly}
        rows={6}
        placeholder={'{ "events": { "click": [{ "type": "navigate", "to": "devices" }] } }'}
        onChange={(e) => change(e.currentTarget.value)}
      />
      {error && <div className="detail-field__error">{error}</div>}
    </>
  );
}

/**
 * repeat / visible / events を JSON で編集する欄（`props._p0` に入る）。
 * Puck の欄として GUI を作るほどではないものの逃げ道。
 */
export const detailField: CustomField<P0Extra | undefined> = {
  type: "custom",
  label: "詳細（repeat / visible / events の JSON）",
  // id は選択中の item ごとに変わるので、key にして選択を切り替えたら入力を作り直す
  render: ({ id, name, value, onChange, readOnly }) => (
    <FieldLabel label="詳細（repeat / visible / events の JSON）" readOnly={readOnly}>
      <DetailEditor key={id} name={name} value={value} onChange={onChange} readOnly={readOnly} />
    </FieldLabel>
  ),
};
