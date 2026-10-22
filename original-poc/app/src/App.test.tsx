import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { App } from "./App";
import { EXAMPLE_FILE_NAME, loadExample } from "./example";
import { createEditorStore, EditorContext } from "./state/store";

afterEach(cleanup);

function renderApp() {
  const store = createEditorStore({ project: loadExample(), file: { name: EXAMPLE_FILE_NAME } });
  render(
    <EditorContext.Provider value={store}>
      <App />
    </EditorContext.Provider>,
  );
  return store;
}

describe("App", () => {
  it("題材を開いた状態で、ヘッダー・ビュー切替・検証の件数を出す", () => {
    renderApp();
    expect((screen.getByLabelText("プロジェクト名") as HTMLInputElement).value).toBe(
      "機器の設定＆モニタリング",
    );
    expect(screen.getByText(EXAMPLE_FILE_NAME)).toBeTruthy();
    expect(screen.getByRole("button", { name: "検証: エラー 0 件・警告 0 件" })).toBeTruthy();
    const nav = screen.getByRole("navigation", { name: "ビュー" });
    expect(within(nav).getByRole("button", { name: "ER" }).getAttribute("aria-pressed")).toBe(
      "true",
    );
    fireEvent.click(within(nav).getByRole("button", { name: "データ" }));
    expect(screen.getByText("機器（Device）: 5 件")).toBeTruthy();
  });

  it("プロジェクト名を変えると Undo / Redo できる（ショートカットも）", () => {
    const store = renderApp();
    const input = screen.getByLabelText("プロジェクト名") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "新しい名前" } });
    fireEvent.blur(input);
    expect(store.getState().project.name).toBe("新しい名前");
    expect(screen.getByText("●")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "↶ 元に戻す" }));
    expect(input.value).toBe("機器の設定＆モニタリング");
    fireEvent.keyDown(window, { key: "z", ctrlKey: true, shiftKey: true });
    expect(input.value).toBe("新しい名前");
    fireEvent.keyDown(window, { key: "z", metaKey: true });
    expect(input.value).toBe("機器の設定＆モニタリング");
  });

  it("未保存の変更があると、新規作成の前に確かめる", () => {
    const store = renderApp();
    act(() => store.getState().edit("x", (d) => void (d.name = "変更")));
    fireEvent.click(screen.getByRole("button", { name: "新規" }));
    const dialog = screen.getByRole("alertdialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "破棄して新規作成" }));
    expect(store.getState().project.entities).toEqual([]);
    expect(screen.getByText("新しいプロジェクトを作りました")).toBeTruthy();
  });

  it("検証の問題を選ぶと該当のビューを開く", () => {
    const store = renderApp();
    act(() => store.getState().edit("壊す", (d) => void (d.dialogs[0]!.entity = "Gadget")));
    fireEvent.click(screen.getByRole("button", { name: "検証: エラー 1 件・警告 0 件" }));
    const panel = screen.getByRole("region", { name: "検証の結果" });
    fireEvent.click(within(panel).getByText('エンティティ "Gadget" がありません'));
    expect(store.getState().view).toBe("flow");
    expect(store.getState().selection).toEqual({ kind: "container", id: "deviceEdit" });
  });
});
