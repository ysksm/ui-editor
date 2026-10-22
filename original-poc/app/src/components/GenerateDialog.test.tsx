import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type { Project } from "@ui-editor/poc-model";
import { afterEach, describe, expect, it } from "vitest";
import { App } from "../App";
import { loadExample } from "../example";
import { createEditorStore, EditorContext, type ViewId } from "../state/store";

afterEach(cleanup);

function erOnly(): Project {
  return { ...loadExample(), entry: undefined, screens: [], dialogs: [], layout: undefined };
}

function renderWith(view: ViewId) {
  const store = createEditorStore({ project: erOnly(), view });
  render(
    <EditorContext.Provider value={store}>
      <App />
    </EditorContext.Provider>,
  );
  return store;
}

describe("生成の UI", () => {
  it("ER ビュー: エンティティのパネルのボタン 1 つで、一覧・詳細・編集・削除を作る", () => {
    const store = renderWith("er");
    act(() => store.getState().select({ kind: "entity", id: "Device" }));
    const panel = screen.getByRole("complementary", { name: "エンティティの編集" });
    fireEvent.click(
      within(panel).getByRole("button", { name: "画面を生成（一覧・詳細・編集・削除）" }),
    );
    const p = store.getState().project;
    expect([...p.screens, ...p.dialogs].map((c) => c.id)).toEqual([
      "devices",
      "deviceDetail",
      "deviceForm",
      "deviceDelete",
    ]);
    expect(screen.getByRole("status").textContent).toContain(
      "機器一覧、機器詳細、機器の編集、機器の削除 を作りました",
    );
    expect(store.getState().issues).toEqual([]);
    // パネルに作った画面が並び、選ぶと画面ビューで開く
    fireEvent.click(within(panel).getByRole("button", { name: /機器詳細/ }));
    expect(store.getState().view).toBe("screen");
    expect(store.getState().selection).toEqual({ kind: "container", id: "deviceDetail" });
  });

  it("フロービュー: エンティティと作るものを選んで生成する", () => {
    const store = renderWith("flow");
    fireEvent.click(screen.getByRole("button", { name: "ER から画面を生成…" }));
    const dialog = screen.getByRole("dialog", { name: "ER から画面を生成" });
    fireEvent.change(within(dialog).getByLabelText("生成するエンティティ"), {
      target: { value: "Alarm" },
    });
    expect(dialog.textContent).toContain("Alarm は Device の入れ子なので");
    fireEvent.click(within(dialog).getByLabelText("削除の確認（ダイアログ）"));
    fireEvent.click(within(dialog).getByRole("button", { name: "生成する" }));
    const p = store.getState().project;
    expect([...p.screens, ...p.dialogs].map((c) => c.id)).toEqual([
      "alarms",
      "alarmDetail",
      "alarmForm",
    ]);
    expect(store.getState().selection).toEqual({ kind: "container", id: "alarms" });
  });

  it("画面ビュー: テンプレートを当て直すときは、置き換わる部品を示す", () => {
    const store = renderWith("screen");
    act(() => {
      store.getState().edit(
        "準備",
        (d) =>
          void d.screens.push({
            id: "s1",
            name: "画面",
            root: { id: "box", type: "Box", children: [{ id: "hello", type: "Text" }] },
          }),
      );
      store.getState().select({ kind: "container", id: "s1" });
    });
    const settings = screen.getByRole("region", { name: "役割とエンティティ" });
    fireEvent.change(within(settings).getByLabelText("役割"), { target: { value: "list" } });
    fireEvent.click(within(settings).getByRole("button", { name: "テンプレートを適用" }));
    expect(screen.getByRole("alertdialog").textContent).toContain(
      "仮の部品でない部品 2 個: box、hello",
    );
  });
});
