// @vitest-environment jsdom
import { cleanup, render, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { DesktopApp } from "./DesktopApp";

afterEach(cleanup);

describe("DesktopApp", () => {
  it("P3 のエディタで題材の S1 を開く", () => {
    render(<DesktopApp />);
    const canvas = document.querySelector(".canvas-frame") as HTMLElement;
    expect(within(canvas).getByText("ダッシュボード")).toBeTruthy();
  });
});
