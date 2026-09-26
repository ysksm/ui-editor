import type { Config, Fields, Slot } from "@puckeditor/core";
import type { CSSProperties } from "react";
import type { JsonValue, Style } from "@ui-editor/schema";
import {
  ButtonView,
  CheckboxView,
  NumberInputView,
  TableView,
  TextInputView,
  TextView,
  type TableColumn,
} from "../parts/builtins.tsx";
import { AlarmRowView, MetricCardView, StatusBadgeView } from "../parts/domain.tsx";
import { valueField } from "./fields.tsx";
import { styleField } from "./style-field.tsx";

/**
 * Puck のコンポーネント定義。
 * キーは P0 の node の `type`（組み込み・コンポーネント名）と同じにし、props の名前も P0 に合わせる。
 * すべて `inline: true` にして、Puck のラッパー div を挟まずに自前の要素をドラッグ対象にする
 * （ラッパーがあると flex の子要素にならず、幅や flexGrow が効かないため）。
 */

type WithStyle = { style?: Style };

export type Components = {
  Box: WithStyle & { children: Slot };
  Text: WithStyle & { text?: JsonValue; variant?: JsonValue };
  Button: WithStyle & { label?: JsonValue; variant?: JsonValue; disabled?: JsonValue };
  TextInput: WithStyle & {
    label?: JsonValue;
    value?: JsonValue;
    placeholder?: JsonValue;
    disabled?: JsonValue;
  };
  NumberInput: WithStyle & {
    label?: JsonValue;
    value?: JsonValue;
    min?: JsonValue;
    max?: JsonValue;
    step?: JsonValue;
    disabled?: JsonValue;
  };
  Checkbox: WithStyle & { label?: JsonValue; checked?: JsonValue; disabled?: JsonValue };
  Table: WithStyle & { rows?: JsonValue; columns?: TableColumn[] };
  StatusBadge: { status?: JsonValue };
  MetricCard: { label?: JsonValue; value?: JsonValue; unit?: JsonValue };
  AlarmRow: { alarm?: JsonValue; deviceName?: JsonValue };
};

export type EditorConfig = Config<{ components: Components }>;

const css = (style: Style | undefined) => style as CSSProperties | undefined;

const variantField = (options: string[]) =>
  ({
    type: "select",
    label: "variant",
    options: options.map((o) => ({ label: o, value: o })),
  }) as const;

const inputFields = {
  label: { type: "text", label: "label" },
  value: valueField("value"),
  disabled: valueField("disabled"),
} satisfies Fields<Components["TextInput"]>;

export const config: EditorConfig = {
  categories: {
    layout: { title: "レイアウト", components: ["Box"] },
    basic: { title: "基本", components: ["Text", "Button", "Table"] },
    form: { title: "入力", components: ["TextInput", "NumberInput", "Checkbox"] },
    domain: {
      title: "題材のコンポーネント",
      components: ["StatusBadge", "MetricCard", "AlarmRow"],
    },
  },
  components: {
    Box: {
      label: "Container (Box)",
      inline: true,
      fields: { style: styleField, children: { type: "slot" } },
      defaultProps: {
        style: { display: "flex", flexDirection: "column", gap: 8, padding: 8 },
        children: [],
      },
      render: ({ children: Children, style, puck }) => (
        <Children ref={puck.dragRef} className="p-box" style={css(style)} minEmptyHeight={48} />
      ),
    },
    Text: {
      inline: true,
      fields: {
        style: styleField,
        text: { type: "text", label: "text" },
        variant: variantField(["body", "title", "caption"]),
      },
      defaultProps: { text: "テキスト", variant: "body" },
      render: ({ puck, style, ...props }) => (
        <TextView {...props} style={css(style)} elRef={puck.dragRef} />
      ),
    },
    Button: {
      inline: true,
      fields: {
        style: styleField,
        label: { type: "text", label: "label" },
        variant: variantField(["primary", "secondary", "danger"]),
        disabled: valueField("disabled"),
      },
      defaultProps: { label: "ボタン", variant: "primary" },
      render: ({ puck, style, ...props }) => (
        <ButtonView {...props} style={css(style)} elRef={puck.dragRef} />
      ),
    },
    TextInput: {
      label: "Input (TextInput)",
      inline: true,
      fields: {
        ...inputFields,
        placeholder: { type: "text", label: "placeholder" },
        style: styleField,
      },
      defaultProps: { label: "ラベル" },
      render: ({ puck, style, ...props }) => (
        <TextInputView {...props} style={css(style)} elRef={puck.dragRef} />
      ),
    },
    NumberInput: {
      inline: true,
      fields: {
        ...inputFields,
        min: valueField("min"),
        max: valueField("max"),
        step: valueField("step"),
        style: styleField,
      },
      defaultProps: { label: "数値" },
      render: ({ puck, style, ...props }) => (
        <NumberInputView {...props} style={css(style)} elRef={puck.dragRef} />
      ),
    },
    Checkbox: {
      inline: true,
      fields: {
        style: styleField,
        label: { type: "text", label: "label" },
        checked: valueField("checked"),
        disabled: valueField("disabled"),
      },
      defaultProps: { label: "チェック" },
      render: ({ puck, style, ...props }) => (
        <CheckboxView {...props} style={css(style)} elRef={puck.dragRef} />
      ),
    },
    Table: {
      inline: true,
      fields: {
        style: styleField,
        rows: valueField("rows"),
        columns: {
          type: "array",
          label: "columns",
          arrayFields: {
            header: valueField("header"),
            value: valueField("value"),
          },
          defaultItemProps: { header: "列", value: "{{ row.id }}" },
          getItemSummary: (item) => String(item.header ?? "列"),
        },
      },
      defaultProps: {
        rows: "{{ data.devices }}",
        columns: [
          { header: "名前", value: "{{ row.name }}" },
          { header: "IP アドレス", value: "{{ row.ipAddress }}" },
        ],
      },
      render: ({ puck, style, ...props }) => (
        <TableView {...props} style={css(style)} elRef={puck.dragRef} />
      ),
    },
    StatusBadge: {
      inline: true,
      fields: { status: valueField("status") },
      defaultProps: { status: "online" },
      render: ({ puck, ...props }) => <StatusBadgeView {...props} elRef={puck.dragRef} />,
    },
    MetricCard: {
      inline: true,
      fields: {
        label: { type: "text", label: "label" },
        value: valueField("value"),
        unit: { type: "text", label: "unit" },
      },
      defaultProps: { label: "温度", value: 42, unit: "℃" },
      render: ({ puck, ...props }) => <MetricCardView {...props} elRef={puck.dragRef} />,
    },
    AlarmRow: {
      inline: true,
      fields: { alarm: valueField("alarm"), deviceName: valueField("deviceName") },
      defaultProps: { alarm: "{{ alarm }}", deviceName: "{{ alarm.deviceId }}" },
      render: ({ puck, ...props }) => <AlarmRowView {...props} elRef={puck.dragRef} />,
    },
  },
};
