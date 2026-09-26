import { describe, expect, it } from "vitest";
import { checkTemplate, extractExpressions, hasBinding, wholeExpression } from "./binding.js";

describe("binding", () => {
  it("extracts expressions", () => {
    expect(extractExpressions("{{ device.name }} ({{device.model}})")).toEqual([
      "device.name",
      "device.model",
    ]);
    expect(hasBinding("plain")).toBe(false);
  });

  it("detects a whole-value binding", () => {
    expect(wholeExpression(" {{ data.devices }} ")).toBe("data.devices");
    expect(wholeExpression("{{ a }} / {{ b }}")).toBeUndefined();
    expect(wholeExpression("x {{ a }}")).toBeUndefined();
  });

  it("checks template syntax", () => {
    expect(checkTemplate("{{ a }} and {{ b }}")).toBeUndefined();
    expect(checkTemplate("{{ a")).toMatch(/閉じられていません/);
    expect(checkTemplate("a }}")).toMatch(/対応する/);
    expect(checkTemplate("{{  }}")).toMatch(/空/);
  });
});
