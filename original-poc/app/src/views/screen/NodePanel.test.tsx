import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { findNode } from "@ui-editor/poc-model";
import { afterEach, describe, expect, it } from "vitest";
import { App } from "../../App";
import { loadExample } from "../../example";
import { createEditorStore, EditorContext } from "../../state/store";

afterEach(cleanup);

function renderDetail() {
  const store = createEditorStore({ project: loadExample(), view: "screen" });
  render(
    <EditorContext.Provider value={store}>
      <App />
    </EditorContext.Provider>,
  );
  act(() => store.getState().select({ kind: "container", id: "deviceDetail" }));
  return store;
}

const outline = () => screen.getByRole("region", { name: "中身" });
const panel = () => screen.getByRole("region", { name: "部品の編集" });
const sample = () => screen.getByRole("region", { name: "この画面のプレビュー" });
const detailRoot = (store: ReturnType<typeof renderDetail>) =>
  store.getState().project.screens.find((s) => s.id === "deviceDetail")!.root;
const commit = (label: string, value: string) => {
  const input = within(panel()).getByLabelText(label) as HTMLInputElement;
  fireEvent.change(input, { target: { value } });
  fireEvent.blur(input);
};

describe("画面ビュー: 部品の編集", () => {
  it("選んだ Box にパレットから部品を足し、文言を変えるとプレビューに出る", () => {
    const store = renderDetail();
    fireEvent.click(within(outline()).getByText("toolbar"));
    fireEvent.change(within(outline()).getByLabelText("部品を追加"), {
      target: { value: "Button" },
    });
    expect(store.getState().selection).toEqual({
      kind: "node",
      container: "deviceDetail",
      node: "button1",
    });
    expect(findNode(detailRoot(store), "toolbar")!.children!.map((n) => n.id)).toEqual([
      "delete",
      "back",
      "button1",
    ]);
    commit("文言（button1）", "設定へ");
    expect(within(sample()).getByRole("button", { name: "設定へ" })).toBeTruthy();
  });

  it("文言にバインディングの候補（datalist）、並べ替え・削除", () => {
    const store = renderDetail();
    fireEvent.click(within(outline()).getByText("model"));
    const input = within(panel()).getByLabelText("文言（model）") as HTMLInputElement;
    const list = document.getElementById(input.getAttribute("list")!)!;
    expect([...list.querySelectorAll("option")].map((o) => o.getAttribute("value"))).toContain(
      "{{ record?.firmware }}",
    );
    commit("文言（model）", "ファームウェア: {{ record?.firmware }}");
    expect(within(sample()).getByText("ファームウェア: 4.2.1")).toBeTruthy();
    fireEvent.click(within(panel()).getByRole("button", { name: "部品を上へ" }));
    expect(
      detailRoot(store)!
        .children!.map((n) => n.id)
        .slice(0, 2),
    ).toEqual(["model", "title"]);
    fireEvent.click(within(panel()).getByRole("button", { name: "部品を削除" }));
    expect(findNode(detailRoot(store), "model")).toBeUndefined();
    expect(store.getState().selection).toEqual({ kind: "container", id: "deviceDetail" });
  });

  it("表の列を足し、行の候補（row）を出す。イベントのアクションを足す", () => {
    const store = renderDetail();
    fireEvent.click(within(outline()).getByText("alarms"));
    fireEvent.change(within(panel()).getByLabelText("行のエンティティ（alarms）"), {
      target: { value: "Alarm" },
    });
    fireEvent.click(within(panel()).getByRole("button", { name: "＋ 列" }));
    const value = within(panel()).getByLabelText("列 4 の値") as HTMLInputElement;
    const list = document.getElementById(value.getAttribute("list")!)!;
    expect([...list.querySelectorAll("option")].map((o) => o.getAttribute("value"))).toContain(
      "{{ row.occurredAt }}",
    );
    fireEvent.change(value, { target: { value: "{{ row.occurredAt }}" } });
    fireEvent.blur(value);
    const table = findNode(detailRoot(store), "alarms")!;
    expect(table.props!.columns).toHaveLength(4);
    const group = within(panel()).getByRole("group", { name: "rowClick のアクション" });
    fireEvent.change(within(group).getByLabelText("rowClick のアクションに追加"), {
      target: { value: "select" },
    });
    expect(findNode(detailRoot(store), "alarms")!.events!.rowClick![0]).toMatchObject({
      type: "select",
    });
  });
});
