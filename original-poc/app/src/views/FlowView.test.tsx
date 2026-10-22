import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { createEmptyProject } from "@ui-editor/poc-model";
import { afterEach, describe, expect, it } from "vitest";
import { App } from "../App";
import { loadExample } from "../example";
import { createEditorStore, EditorContext } from "../state/store";

afterEach(cleanup);

function renderFlow(project = createEmptyProject()) {
  const store = createEditorStore({ project, view: "flow" });
  render(
    <EditorContext.Provider value={store}>
      <App />
    </EditorContext.Provider>,
  );
  return store;
}

const list = () => screen.getByRole("navigation", { name: "画面とダイアログ" });
const commit = (label: string, value: string) => {
  const input = screen.getByLabelText(label) as HTMLInputElement;
  fireEvent.change(input, { target: { value } });
  fireEvent.blur(input);
};

describe("フロービュー: 画面・ダイアログの一覧", () => {
  it("画面とダイアログを作り、名前と id を変える", () => {
    const store = renderFlow();
    fireEvent.click(screen.getByRole("button", { name: "＋ 画面" }));
    commit("画面の名前", "機器一覧");
    commit("画面の id", "devices");
    fireEvent.click(screen.getByRole("button", { name: "＋ ダイアログ" }));
    commit("ダイアログの名前", "削除の確認");
    expect(store.getState().project.screens).toEqual([{ id: "devices", name: "機器一覧" }]);
    expect(store.getState().project.dialogs).toEqual([{ id: "dialog1", name: "削除の確認" }]);
    expect(
      within(list())
        .getAllByRole("button")
        .map((b) => b.textContent),
    ).toEqual(["▶機器一覧devices", "削除の確認dialog1"]);
  });

  it("id の誤りはその場で示す。最初の画面を変える", () => {
    const store = renderFlow(loadExample());
    fireEvent.click(within(list()).getByRole("button", { name: /機器一覧/ }));
    commit("画面の id", "deviceEdit");
    expect(screen.getByText('"deviceEdit" は既にあります')).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "最初の画面にする" }));
    expect(store.getState().project.entry).toBe("devices");
    expect(screen.getByText("▶ 最初の画面")).toBeTruthy();
  });

  it("消すときは、一緒に消える遷移の数を示して確かめる", () => {
    const store = renderFlow(loadExample());
    act(() => store.getState().select({ kind: "container", id: "deviceDetail" }));
    fireEvent.click(screen.getByRole("button", { name: "画面を削除" }));
    const dialog = screen.getByRole("alertdialog");
    expect(dialog.textContent).toContain("ここへの遷移 1 本も消えます");
    fireEvent.click(within(dialog).getByRole("button", { name: "削除する" }));
    const p = store.getState().project;
    expect(p.screens.map((s) => s.id)).toEqual(["dashboard", "devices"]);
    expect(p.screens[1]!.root!.children![2]!.events).toBeUndefined();
    expect(store.getState().issues).toEqual([]);
  });
});
