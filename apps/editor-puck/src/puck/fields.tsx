import { FieldLabel, type CustomField } from "@puckeditor/core";
import type { JsonValue } from "@ui-editor/schema";
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
