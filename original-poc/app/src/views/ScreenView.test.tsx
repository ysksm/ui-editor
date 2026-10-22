import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { addContainer } from "@ui-editor/poc-model";
import { afterEach, describe, expect, it } from "vitest";
import { App } from "../App";
import { loadExample } from "../example";
import { createEditorStore, EditorContext } from "../state/store";

afterEach(cleanup);

function renderScreen() {
  const store = createEditorStore({ project: loadExample(), view: "screen" });
  render(
    <EditorContext.Provider value={store}>
      <App />
    </EditorContext.Provider>,
  );
  return store;
}

const settings = () => screen.getByRole("region", { name: "役割とエンティティ" });
const sample = () => screen.getByRole("region", { name: "この画面のプレビュー" });

describe("画面ビュー", () => {
  it("中身の木と、見本のレコードでその画面だけのプレビューを出す", () => {
    const store = renderScreen();
    act(() => store.getState().select({ kind: "container", id: "deviceEdit" }));
    expect((within(settings()).getByLabelText("役割") as HTMLSelectElement).value).toBe("form");
    const outline = screen.getByRole("region", { name: "中身" });
    expect(within(outline).getByText("save")).toBeTruthy();
    expect((within(sample()).getByLabelText("名前") as HTMLInputElement).value).toBe(
      "コアスイッチ A",
    );
    fireEvent.change(within(sample()).getByLabelText("見本のレコード"), {
      target: { value: "dev-004" },
    });
    expect((within(sample()).getByLabelText("名前") as HTMLInputElement).value).toBe("無線 AP 2F");
  });

  it("中身の無い画面に役割とエンティティを選んでテンプレートを当てる", () => {
    const store = renderScreen();
    act(() => {
      store
        .getState()
        .edit(
          "準備",
          (d) => void addContainer(d, "screen", { id: "alarms", name: "アラーム一覧" }),
        );
      store.getState().select({ kind: "container", id: "alarms" });
    });
    fireEvent.change(within(settings()).getByLabelText("役割"), { target: { value: "list" } });
    fireEvent.change(within(settings()).getByLabelText("エンティティ"), {
      target: { value: "Alarm" },
    });
    fireEvent.click(within(settings()).getByRole("button", { name: "テンプレートを適用" }));
    const s = store.getState().project.screens.at(-1)!;
    expect(s).toMatchObject({ kind: "list", entity: "Alarm" });
    // 入れ子のエンティティの一覧は、全機器のアラームを並べる
    expect(within(sample()).getAllByRole("row")).toHaveLength(11);
  });

  it("仮の部品でない中身があれば、置き換える前に確かめる", () => {
    const store = renderScreen();
    act(() => store.getState().select({ kind: "container", id: "devices" }));
    fireEvent.change(within(settings()).getByLabelText("役割"), { target: { value: "detail" } });
    fireEvent.click(within(settings()).getByRole("button", { name: "テンプレートを適用" }));
    const dialog = screen.getByRole("alertdialog");
    expect(dialog.textContent).toMatch(/仮の部品でない部品 \d+ 個/);
    fireEvent.click(within(dialog).getByRole("button", { name: "やめる" }));
    expect(store.getState().project.screens[1]!.kind).toBe("list");
  });
});
