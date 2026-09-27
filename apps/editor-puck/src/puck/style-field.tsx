import { FieldLabel, type CustomField, type ObjectField } from "@puckeditor/core";
import { StyleSchema, type Style } from "@ui-editor/schema";
import { lengthToText, textToLength } from "./value-text.ts";

/**
 * スタイル（P0 の node.style）の編集欄。Puck の `object` フィールドに、長さ用・列挙用のカスタム欄を並べる。
 * object フィールドは既存の値に変更したキーだけを上書きするので、ここに無いキー（border など）は保たれる。
 * 未設定に戻したキーは undefined になる（保存時の正規化で消える）。
 */

type Length = number | string | undefined;

function lengthField(label: string, placeholder = "例: 200 / 100% / auto"): CustomField<Length> {
  return {
    type: "custom",
    label,
    render: ({ name, value, onChange, readOnly }) => (
      <FieldLabel label={label} readOnly={readOnly}>
        <input
          className="value-field"
          name={name}
          value={lengthToText(value)}
          readOnly={readOnly}
          placeholder={placeholder}
          onChange={(e) => onChange(textToLength(e.currentTarget.value))}
        />
      </FieldLabel>
    ),
  };
}

function textField(label: string, placeholder: string): CustomField<string | undefined> {
  return {
    type: "custom",
    label,
    render: ({ name, value, onChange, readOnly }) => (
      <FieldLabel label={label} readOnly={readOnly}>
        <input
          className="value-field"
          name={name}
          value={value ?? ""}
          readOnly={readOnly}
          placeholder={placeholder}
          onChange={(e) => onChange(e.currentTarget.value || undefined)}
        />
      </FieldLabel>
    ),
  };
}

function numberField(label: string): CustomField<number | undefined> {
  return {
    type: "custom",
    label,
    render: ({ name, value, onChange, readOnly }) => (
      <FieldLabel label={label} readOnly={readOnly}>
        <input
          className="value-field"
          name={name}
          type="number"
          value={value ?? ""}
          readOnly={readOnly}
          onChange={(e) => {
            const text = e.currentTarget.value;
            onChange(text === "" ? undefined : Number(text));
          }}
        />
      </FieldLabel>
    ),
  };
}

/** 列挙の選択欄。先頭の「（未設定）」で undefined に戻せる。選択肢は P0 のスキーマから取る。 */
function enumField<T extends string>(
  label: string,
  options: readonly T[],
): CustomField<T | undefined> {
  return {
    type: "custom",
    label,
    render: ({ name, value, onChange, readOnly }) => (
      <FieldLabel label={label} readOnly={readOnly}>
        <select
          className="value-field"
          name={name}
          value={value ?? ""}
          disabled={readOnly}
          onChange={(e) => onChange((e.currentTarget.value || undefined) as T | undefined)}
        >
          <option value="">（未設定）</option>
          {options.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      </FieldLabel>
    ),
  };
}

const s = StyleSchema.shape;

export const styleField: ObjectField<Style> = {
  type: "object",
  label: "スタイル",
  objectFields: {
    width: lengthField("width"),
    height: lengthField("height"),
    padding: lengthField("padding", "例: 12 / 4px 8px"),
    margin: lengthField("margin", "例: 12 / 0 auto"),
    display: enumField("display", s.display.unwrap().options),
    flexDirection: enumField("flexDirection", s.flexDirection.unwrap().options),
    flexWrap: enumField("flexWrap", s.flexWrap.unwrap().options),
    justifyContent: enumField("justifyContent", s.justifyContent.unwrap().options),
    alignItems: enumField("alignItems", s.alignItems.unwrap().options),
    gap: lengthField("gap", "例: 8"),
    flexGrow: numberField("flexGrow"),
    border: textField("border", "例: 1px solid #ddd"),
    borderRadius: lengthField("borderRadius", "例: 8"),
  },
};
