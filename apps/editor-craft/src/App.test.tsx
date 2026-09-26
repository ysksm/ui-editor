// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { App } from "./App";
import { loadExampleProject } from "./project/example";

afterEach(cleanup);

describe("App", () => {
  it("題材の S1 を Craft のキャンバスに描く", () => {
    render(<App initialProject={loadExampleProject()} />);
    const canvas = document.querySelector(".canvas-frame") as HTMLElement;
    expect(within(canvas).getByText("ダッシュボード")).toBeTruthy();
    // コンポーネントのインスタンス（MetricCard）の中身もサンプルデータで評価して描く
    expect(within(canvas).getByText("最高温度")).toBeTruthy();
  });

  it("パレットのクリックでパーツを追加し、画面を切り替えられる", () => {
    render(<App initialProject={loadExampleProject()} />);
    fireEvent.click(screen.getByRole("button", { name: "機器一覧" }));
    const canvas = document.querySelector(".canvas-frame") as HTMLElement;
    expect(within(canvas).getByText("型番")).toBeTruthy();

    const palette = document.querySelector(".palette") as HTMLElement;
    fireEvent.click(within(palette).getByRole("button", { name: "Button" }));
    expect(within(canvas).getByRole("button", { name: "ボタン" })).toBeTruthy();
    // 追加したノードには P0 の id が付き、レイヤーに出る
    expect(
      within(document.querySelector(".layers") as HTMLElement).getByText("button1"),
    ).toBeTruthy();

    // S1 に切り替えて戻っても、追加したパーツは残っている
    fireEvent.click(screen.getByRole("button", { name: "ダッシュボード" }));
    expect(within(canvas).queryByRole("button", { name: "ボタン" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "機器一覧" }));
    expect(within(canvas).getByRole("button", { name: "ボタン" })).toBeTruthy();
  });
});
