import { describe, expect, it } from "vitest";
import { evaluate, evaluateStyle } from "./evaluate.ts";

describe("evaluate", () => {
  const scope = { props: { label: "温度", value: 42, unit: "℃", status: "online" } };

  it("文字列全体が式なら値をそのまま返す", () => {
    expect(evaluate("{{ props.value }}", scope)).toBe(42);
  });

  it("埋め込みは文字列にする", () => {
    expect(evaluate("{{ props.value }} {{ props.unit }}", scope)).toBe("42 ℃");
  });

  it("評価できない式はそのまま残す", () => {
    expect(evaluate("{{ data.devices }}", scope)).toBe("{{ data.devices }}");
    expect(evaluate("機器: {{ device.name }}", scope)).toBe("機器: {{ device.name }}");
  });

  it("props の値が未評価の式なら、その式を表示する", () => {
    const s = { props: { status: "{{ device.status }}" } };
    expect(evaluate("{{ ({ online: 'オンライン' })[props.status] }}", s)).toBe(
      "{{ device.status }}",
    );
  });

  it("オブジェクト・配列の中も評価する", () => {
    expect(evaluate({ a: ["{{ props.label }}", 1] }, scope)).toEqual({ a: ["温度", 1] });
  });
});

describe("evaluateStyle", () => {
  it("評価できない値は消す。color と backgroundColor は片方が消えたら両方消す", () => {
    const scope = { props: { status: "{{ device.status }}" } };
    expect(
      evaluateStyle(
        { color: "#fff", backgroundColor: "{{ ({ online: 'green' })[props.status] }}" },
        scope,
      ),
    ).toEqual({});
    expect(evaluateStyle({ color: "#fff", width: "{{ props.w }}" }, scope)).toEqual({
      color: "#fff",
    });
  });
});
