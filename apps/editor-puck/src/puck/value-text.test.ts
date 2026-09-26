import { describe, expect, it } from "vitest";
import { lengthToText, textToLength, textToValue, valueToText } from "./value-text.ts";

describe("value-text", () => {
  it.each([
    ["{{ device.name }}", "{{ device.name }}"],
    ["名前", "名前"],
    ["12", 12],
    ["-1.5", -1.5],
    ["true", true],
    ["null", null],
    ['{"a":1}', { a: 1 }],
    ["{ 壊れた", "{ 壊れた"],
  ])("%s を読み、同じ表示に戻る", (text, value) => {
    expect(textToValue(text)).toEqual(value);
    expect(valueToText(value)).toBe(text);
  });

  it("空欄は undefined", () => {
    expect(textToValue("")).toBeUndefined();
    expect(valueToText(undefined)).toBe("");
  });
});

describe("length", () => {
  it.each([
    ["200", 200],
    ["0", 0],
    ["100%", "100%"],
    ["4px 8px", "4px 8px"],
    ["auto", "auto"],
  ])("%s ⇔ %s", (text, value) => {
    expect(textToLength(text)).toBe(value);
    expect(lengthToText(value)).toBe(text);
  });

  it("空欄は undefined", () => {
    expect(textToLength("  ")).toBeUndefined();
    expect(lengthToText(undefined)).toBe("");
  });
});
