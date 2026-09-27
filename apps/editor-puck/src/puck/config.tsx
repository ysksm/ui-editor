import type { ComponentConfig, Config, Fields, RootConfig, Slot } from "@puckeditor/core";
import type { CSSProperties } from "react";
import type { Component, JsonValue, Style } from "@ui-editor/schema";
import {
  ButtonView,
  CheckboxView,
  NumberInputView,
  TableView,
  TextInputView,
  TextView,
  type TableColumn,
} from "../parts/builtins.tsx";
import { componentProps, NodeView, type ComponentMap } from "../render/NodeView.tsx";
import type { P0Extra } from "../convert/convert.ts";
import { detailField, valueField } from "./fields.tsx";
import { styleField } from "./style-field.tsx";

/**
 * Puck のコンポーネント定義。
 * キーは P0 の node の `type`（組み込み・コンポーネント名）と同じにし、props の名前も P0 に合わせる。
 * 組み込みは固定、プロジェクトのコンポーネント（P0 の `components`）は `createConfig` で定義から作る。
 * すべて `inline: true` にして、Puck のラッパー div を挟まずに自前の要素をドラッグ対象にする
 * （ラッパーがあると flex の子要素にならず、幅や flexGrow が効かないため）。
 */

type WithStyle = { style?: Style; _p0?: P0Extra };

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
};

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

const builtinComponents: Config<{ components: Components }>["components"] = {
  Box: {
    label: "Container (Box)",
    inline: true,
    fields: { style: styleField, _p0: detailField, children: { type: "slot" } },
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
      _p0: detailField,
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
      _p0: detailField,
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
      _p0: detailField,
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
      _p0: detailField,
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
      _p0: detailField,
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
      _p0: detailField,
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
};

/** Puck の root の props（`convert.ts` の ROOT_NODE_ID / ROOT_SLOT と同じ名前）。 */
type RootProps = { nodeId?: string; style?: Style; items: Slot };

/**
 * Puck の root。ツリーの root が Box なら、その Box として振る舞う（style と slot `items`）。
 * root が Box でないツリーでは nodeId が無く、Puck 既定の content をそのまま描く（欄も出さない）。
 */
const rootConfig: RootConfig<RootProps> = {
  label: "Container (Box)（ルート）",
  fields: { style: styleField, items: { type: "slot" } },
  resolveFields: (data, { fields }) =>
    data.props?.nodeId === undefined ? ({} as typeof fields) : fields,
  render: ({ puck, children, nodeId, style, items: Items }) =>
    nodeId === undefined ? (
      <>{children}</>
    ) : (
      <Items ref={puck.dragRef} className="p-box" style={css(style)} minEmptyHeight={48} />
    ),
};

/** ノードの type として使えない名前（組み込み）。 */
export const BUILTIN_TYPES: ReadonlySet<string> = new Set(Object.keys(builtinComponents));

/** プロジェクトのコンポーネント 1 つを Puck のコンポーネントにする。中身は P0 の定義をそのまま描く。 */
function projectComponent(component: Component, components: ComponentMap): ComponentConfig {
  const defs = Object.entries(component.props ?? {});
  return {
    label: component.name ? `${component.name}（${component.id}）` : component.id,
    inline: true,
    fields: {
      ...Object.fromEntries(defs.map(([name, def]) => [name, valueField(`${name}: ${def.type}`)])),
      _p0: detailField,
    },
    defaultProps: Object.fromEntries(
      defs.filter(([, def]) => def.default !== undefined).map(([name, def]) => [name, def.default]),
    ),
    render: ({ puck, ...values }) => (
      <NodeView
        node={component.root}
        // 定義された props だけを渡す（Puck の id や _p0 は渡さない）
        scope={{
          props: componentProps(
            component,
            Object.fromEntries(defs.map(([name]) => [name, values[name]])),
          ),
        }}
        components={components}
        elRef={puck.dragRef}
      />
    ),
  };
}

/**
 * Puck の config を作る。
 * @param exclude パレットに出さないコンポーネント（編集中のコンポーネント自身など、入れると循環するもの）
 */
export function createConfig(
  components: Component[] = [],
  exclude: ReadonlySet<string> = new Set(),
): Config {
  const map: ComponentMap = new Map(components.map((c) => [c.id, c]));
  const project = Object.fromEntries(components.map((c) => [c.id, projectComponent(c, map)]));
  return {
    root: rootConfig,
    categories: {
      layout: { title: "レイアウト", components: ["Box"] },
      basic: { title: "基本", components: ["Text", "Button", "Table"] },
      form: { title: "入力", components: ["TextInput", "NumberInput", "Checkbox"] },
      project: {
        title: "コンポーネント",
        components: components.map((c) => c.id).filter((id) => !exclude.has(id)),
      },
      other: { visible: false },
    },
    components: { ...builtinComponents, ...project } as Config["components"],
  };
}
