import type { CSSProperties, Ref } from "react";
import type { Component, JsonValue, Node } from "@ui-editor/schema";
import {
  ButtonView,
  CheckboxView,
  NumberInputView,
  TableView,
  TextInputView,
  TextView,
  type ElementRef,
  type TableColumn,
} from "../parts/builtins.tsx";
import { evaluate, evaluateStyle, type Scope } from "./evaluate.ts";

/**
 * P0 の node ツリーを（Puck を通さずに）そのまま描く。
 * コンポーネントのインスタンスをキャンバスに表示するときに、コンポーネントの中身を描くのに使う。
 * `repeat` は 1 回だけ描く（エディタでは繰り返す値が無いため）。
 */

export type ComponentMap = ReadonlyMap<string, Component>;

const MAX_DEPTH = 20;

/** コンポーネントの props の既定値に、インスタンスの値を重ねる。 */
export function componentProps(
  component: Component,
  values: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [name, def] of Object.entries(component.props ?? {})) {
    if (def.default !== undefined) out[name] = def.default;
  }
  for (const [name, value] of Object.entries(values)) {
    if (value !== undefined) out[name] = value;
  }
  return out;
}

export function NodeView(props: {
  node: Node;
  scope: Scope;
  components: ComponentMap;
  elRef?: ElementRef;
  depth?: number;
}) {
  const { node, scope, components, elRef } = props;
  const depth = props.depth ?? 0;
  if (depth > MAX_DEPTH) {
    return (
      <span className="p-error">
        コンポーネントの入れ子が深すぎます（自分自身を含んでいませんか）
      </span>
    );
  }
  if (node.visible !== undefined && evaluate(node.visible, scope) === false) return null;

  const p = evaluate(node.props as JsonValue | undefined, scope) as
    Record<string, JsonValue> | undefined;
  const style = evaluateStyle(node.style, scope) as CSSProperties | undefined;
  const children = (node.children ?? []).map((child) => (
    <NodeView key={child.id} node={child} scope={scope} components={components} depth={depth + 1} />
  ));

  switch (node.type) {
    case "Box":
      return (
        <div ref={elRef as Ref<HTMLDivElement>} className="p-box" style={style}>
          {children}
        </div>
      );
    case "Text":
      return <TextView {...p} style={style} elRef={elRef} />;
    case "Button":
      return <ButtonView {...p} style={style} elRef={elRef} />;
    case "TextInput":
      return <TextInputView {...p} style={style} elRef={elRef} />;
    case "NumberInput":
      return <NumberInputView {...p} style={style} elRef={elRef} />;
    case "Checkbox":
      return <CheckboxView {...p} style={style} elRef={elRef} />;
    case "Table":
      return (
        <TableView
          rows={p?.rows}
          columns={p?.columns as TableColumn[] | undefined}
          style={style}
          elRef={elRef}
        />
      );
  }

  const component = components.get(node.type);
  if (!component) {
    return (
      <span ref={elRef as Ref<HTMLSpanElement>} className="p-error">
        不明なパーツ: {node.type}
      </span>
    );
  }
  return (
    <NodeView
      node={component.root}
      scope={{ props: componentProps(component, p ?? {}) }}
      components={components}
      elRef={elRef}
      depth={depth + 1}
    />
  );
}
