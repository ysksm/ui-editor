import type { CSSProperties, ReactNode, Ref } from "react";
import type { JsonValue } from "@ui-editor/schema";

/**
 * P0 の組み込みノード（Box 以外）の見た目。エディタのキャンバスで使う。
 * バインディング（`{{ }}`）は評価せず、そのまま表示する。
 */

export type ElementRef = Ref<HTMLElement> | ((el: Element | null) => void) | null | undefined;

export function display(value: JsonValue | undefined): string {
  if (value === undefined || value === null) return "";
  return typeof value === "string" ? value : JSON.stringify(value);
}

function isOn(value: JsonValue | undefined): boolean {
  // バインディングは評価しないので、値が入っていれば「指定あり」とみなす。
  return value !== undefined && value !== false && value !== null && value !== "";
}

type Common = { style?: CSSProperties | undefined; elRef?: ElementRef };

export function TextView(props: Common & { text?: JsonValue; variant?: JsonValue }) {
  const variant = typeof props.variant === "string" ? props.variant : "body";
  return (
    <span
      ref={props.elRef as Ref<HTMLSpanElement>}
      className={`p-text p-text--${variant}`}
      style={props.style}
    >
      {display(props.text) || "（テキスト）"}
    </span>
  );
}

export function ButtonView(
  props: Common & { label?: JsonValue; variant?: JsonValue; disabled?: JsonValue },
) {
  const variant = typeof props.variant === "string" ? props.variant : "primary";
  return (
    <button
      ref={props.elRef as Ref<HTMLButtonElement>}
      type="button"
      className={`p-button p-button--${variant}`}
      style={props.style}
      data-disabled={isOn(props.disabled) || undefined}
    >
      {display(props.label) || "ボタン"}
    </button>
  );
}

function Field(props: Common & { label?: JsonValue; children: ReactNode }) {
  return (
    <label ref={props.elRef as Ref<HTMLLabelElement>} className="p-field" style={props.style}>
      {props.label !== undefined && <span className="p-field__label">{display(props.label)}</span>}
      {props.children}
    </label>
  );
}

export function TextInputView(
  props: Common & {
    label?: JsonValue;
    value?: JsonValue;
    placeholder?: JsonValue;
    disabled?: JsonValue;
  },
) {
  return (
    <Field style={props.style} elRef={props.elRef} label={props.label}>
      <input
        className="p-input"
        readOnly
        value={display(props.value)}
        placeholder={display(props.placeholder)}
        data-disabled={isOn(props.disabled) || undefined}
      />
    </Field>
  );
}

export function NumberInputView(
  props: Common & {
    label?: JsonValue;
    value?: JsonValue;
    min?: JsonValue;
    max?: JsonValue;
    step?: JsonValue;
    disabled?: JsonValue;
  },
) {
  const range = [props.min, props.max].some((v) => v !== undefined)
    ? `${display(props.min)}〜${display(props.max)}`
    : "";
  return (
    <Field style={props.style} elRef={props.elRef} label={props.label}>
      <span className="p-number">
        <input
          className="p-input"
          readOnly
          value={display(props.value)}
          data-disabled={isOn(props.disabled) || undefined}
        />
        {range && <span className="p-number__range">{range}</span>}
      </span>
    </Field>
  );
}

export function CheckboxView(
  props: Common & { label?: JsonValue; checked?: JsonValue; disabled?: JsonValue },
) {
  return (
    <label
      ref={props.elRef as Ref<HTMLLabelElement>}
      className="p-checkbox"
      style={props.style}
      data-disabled={isOn(props.disabled) || undefined}
    >
      <input type="checkbox" readOnly checked={props.checked === true} />
      <span>{display(props.label)}</span>
      {typeof props.checked === "string" && <span className="p-binding">{props.checked}</span>}
    </label>
  );
}

export type TableColumn = { header?: JsonValue; value?: JsonValue };

export function TableView(props: Common & { rows?: JsonValue; columns?: TableColumn[] }) {
  const columns = props.columns ?? [];
  return (
    <div ref={props.elRef as Ref<HTMLDivElement>} className="p-table" style={props.style}>
      <table>
        <thead>
          <tr>
            {columns.map((c, i) => (
              <th key={i}>{display(c.header)}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr>
            {columns.map((c, i) => (
              <td key={i}>{display(c.value)}</td>
            ))}
          </tr>
        </tbody>
      </table>
      <div className="p-binding">rows: {display(props.rows) || "（未設定）"}</div>
    </div>
  );
}
