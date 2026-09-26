import type { Ref } from "react";
import type { JsonValue } from "@ui-editor/schema";
import { display, type ElementRef } from "./builtins.tsx";

/**
 * 題材のコンポーネント（P0 の `components`）の見た目。
 * P2-1 では手書きの React で題材ファイルの定義を再現している。props の名前は P0 のインスタンスと同じ。
 */

const STATUS_LABEL: Record<string, string> = {
  online: "オンライン",
  offline: "オフライン",
  warning: "警告",
};
const STATUS_COLOR: Record<string, string> = {
  online: "#2e7d32",
  offline: "#757575",
  warning: "#ed6c02",
};

export function StatusBadgeView(props: { status?: JsonValue; elRef?: ElementRef }) {
  const status = display(props.status);
  return (
    <span
      ref={props.elRef as Ref<HTMLSpanElement>}
      className="d-badge"
      style={{ backgroundColor: STATUS_COLOR[status] ?? "#9e9e9e" }}
    >
      {STATUS_LABEL[status] ?? (status || "status")}
    </span>
  );
}

export function MetricCardView(props: {
  label?: JsonValue;
  value?: JsonValue;
  unit?: JsonValue;
  elRef?: ElementRef;
}) {
  return (
    <div ref={props.elRef as Ref<HTMLDivElement>} className="d-metric">
      <span className="p-text p-text--caption">{display(props.label)}</span>
      <span className="p-text p-text--title">
        {display(props.value)} {display(props.unit)}
      </span>
    </div>
  );
}

export function AlarmRowView(props: {
  alarm?: JsonValue;
  deviceName?: JsonValue;
  elRef?: ElementRef;
}) {
  return (
    <div ref={props.elRef as Ref<HTMLDivElement>} className="d-alarm">
      <span className="d-alarm__level">LEVEL</span>
      <span className="d-alarm__message">{display(props.alarm) || "（alarm）"}</span>
      <span className="p-text p-text--caption">{display(props.deviceName)}</span>
    </div>
  );
}
