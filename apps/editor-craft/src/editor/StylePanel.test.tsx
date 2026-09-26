// @vitest-environment jsdom
import { cleanup, fireEvent, render, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { App } from "../App";
import { loadExampleProject } from "../project/example";
import { parseStyleValue, updateStyle } from "./StylePanel";

afterEach(cleanup);

describe("parseStyleValue / updateStyle", () => {
  it("数値は number（px）、単位付きは文字列、空はキーを消す", () => {
    expect(parseStyleValue("length", "120")).toBe(120);
    expect(parseStyleValue("length", "50%")).toBe("50%");
    expect(parseStyleValue("length", "4px 8px")).toBe("4px 8px");
    expect(parseStyleValue("length", " ")).toBeUndefined();
    expect(parseStyleValue("number", "abc")).toBeUndefined();
    expect(parseStyleValue("text", "#fff")).toBe("#fff");
  });

  it("空になった style は undefined にする", () => {
    expect(updateStyle({ width: 10 }, "width", undefined)).toBeUndefined();
    expect(updateStyle(undefined, "gap", 8)).toEqual({ gap: 8 });
  });
});

describe("StylePanel", () => {
  const selectLayer = (id: string) => {
    const layers = document.querySelector(".layers") as HTMLElement;
    fireEvent.click(within(layers).getByText(id));
  };
  const panel = () => document.querySelector(".style-panel") as HTMLElement;

  it("幅・高さ・flex の編集がキャンバスに即時反映される", () => {
    render(<App initialProject={loadExampleProject()} />);
    selectLayer("metricSection");
    const section = document.querySelector<HTMLElement>(
      '.canvas-frame [data-node-id="metricSection"]',
    )!;
    expect(section.style.display).toBe("flex");

    fireEvent.change(within(panel()).getByLabelText("width"), { target: { value: "640" } });
    expect(section.style.width).toBe("640px");
    fireEvent.change(within(panel()).getByLabelText("height"), { target: { value: "50%" } });
    expect(section.style.height).toBe("50%");

    fireEvent.change(within(panel()).getByLabelText("flexDirection"), {
      target: { value: "column" },
    });
    expect(section.style.flexDirection).toBe("column");
    fireEvent.change(within(panel()).getByLabelText("justifyContent"), {
      target: { value: "space-between" },
    });
    expect(section.style.justifyContent).toBe("space-between");
    fireEvent.change(within(panel()).getByLabelText("gap"), { target: { value: "" } });
    expect(section.style.gap).toBe("");
  });
});
