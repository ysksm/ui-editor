import { createEmptyProject } from "@ui-editor/poc-model";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { App } from "../App";
import { loadExample } from "../example";
import { createEditorStore, EditorContext } from "../state/store";

afterEach(cleanup);

function renderWith(project = createEmptyProject()) {
  const store = createEditorStore({ project });
  render(
    <EditorContext.Provider value={store}>
      <App />
    </EditorContext.Provider>,
  );
  return store;
}

const panel = () => screen.getByRole("complementary", { name: "エンティティの編集" });
const commit = (label: string, value: string) => {
  const input = within(panel()).getByLabelText(label) as HTMLInputElement;
  fireEvent.change(input, { target: { value } });
  fireEvent.blur(input);
};

describe("ER ビュー", () => {
  it("エンティティを追加し、名前・id・属性・関係をパネルで編集できる", () => {
    const store = renderWith();
    fireEvent.click(screen.getByRole("button", { name: "＋ エンティティ" }));
    commit("エンティティの名前", "機器");
    commit("エンティティの id", "Device");
    fireEvent.click(within(panel()).getByRole("button", { name: "＋ 属性" }));
    commit("属性 field1 の id", "status");
    fireEvent.change(within(panel()).getByLabelText("属性 status の型"), {
      target: { value: "enum" },
    });
    commit("属性 status の値", "online, offline");
    expect(store.getState().project.entities[0]).toEqual({
      id: "Device",
      name: "機器",
      primaryKey: "id",
      fields: [
        { id: "id", type: "id" },
        { id: "status", type: "enum", values: ["online", "offline"] },
      ],
    });

    // 2 つ目のエンティティを作って、1 対多（入れ子）でつなぐ
    fireEvent.click(screen.getByRole("button", { name: "＋ エンティティ" }));
    commit("エンティティの id", "Alarm");
    act(() => store.getState().select({ kind: "entity", id: "Device" }));
    fireEvent.change(within(panel()).getByLabelText("関係の相手"), { target: { value: "Alarm" } });
    fireEvent.click(within(panel()).getByRole("button", { name: "追加" }));
    expect(store.getState().project.entities[0]!.fields.at(-1)).toEqual({
      id: "alarms",
      name: "エンティティ1",
      type: "children",
      entity: "Alarm",
    });
    expect(store.getState().selection).toEqual({ kind: "entity", id: "Device", field: "alarms" });
    expect(store.getState().issues).toEqual([]);
  });

  it("id の誤りはその場で示し、変えない", () => {
    const store = renderWith(loadExample());
    act(() => store.getState().select({ kind: "entity", id: "Alarm" }));
    commit("エンティティの id", "alarm");
    expect(within(panel()).getByText(/PascalCase/)).toBeTruthy();
    expect(store.getState().project.entities[3]!.id).toBe("Alarm");
    commit("エンティティの id", "Device");
    expect(within(panel()).getByText('"Device" は既にあります')).toBeTruthy();
  });

  it("エンティティを消すときは影響を示して確かめる", () => {
    const store = renderWith(loadExample());
    act(() => store.getState().select({ kind: "entity", id: "Alarm" }));
    fireEvent.click(within(panel()).getByRole("button", { name: "エンティティを削除" }));
    const dialog = screen.getByRole("alertdialog");
    expect(dialog.textContent).toContain("データ 10 件と");
    expect(dialog.textContent).toContain("Device.alarms");
    fireEvent.click(within(dialog).getByRole("button", { name: "削除する" }));
    expect(store.getState().project.entities.map((e) => e.id)).toEqual([
      "Device",
      "DeviceSettings",
      "Metric",
    ]);
    expect(store.getState().selection).toBeNull();
  });

  it("入れ子にすると消えるデータがあれば確かめる", () => {
    const store = renderWith(loadExample());
    act(() => {
      store.getState().edit("準備", (d) => {
        d.entities.push({
          id: "Site",
          name: "拠点",
          primaryKey: "id",
          fields: [{ id: "id", type: "id" }],
        });
        d.data.Site = [{ id: "site-1" }];
      });
      store.getState().select({ kind: "entity", id: "Device" });
    });
    fireEvent.change(within(panel()).getByLabelText("関係の相手"), { target: { value: "Site" } });
    fireEvent.click(within(panel()).getByRole("button", { name: "追加" }));
    const dialog = screen.getByRole("alertdialog");
    expect(dialog.textContent).toContain("Site のデータ 1 件は消えます");
  });
});
