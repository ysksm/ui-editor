import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { addContainer, addTransition, findTransition } from "@ui-editor/poc-model";
import { afterEach, describe, expect, it } from "vitest";
import { App } from "../../App";
import { loadExample } from "../../example";
import { createEditorStore, EditorContext } from "../../state/store";

afterEach(cleanup);

/** 題材に「ホーム → 機器詳細」の仮のボタンの遷移を足して、その遷移を選んだ状態。 */
function renderWithHome() {
  const store = createEditorStore({ project: loadExample(), view: "flow" });
  render(
    <EditorContext.Provider value={store}>
      <App />
    </EditorContext.Provider>,
  );
  let key = "";
  act(() => {
    store.getState().edit("準備", (d) => {
      addContainer(d, "screen", { id: "home", name: "ホーム" });
      key = addTransition(d, "home", "deviceDetail");
    });
    store.getState().select({ kind: "transition", key });
  });
  return { store, key };
}

const panel = () => screen.getByRole("complementary", { name: "遷移の編集" });
const transitionOf = (store: ReturnType<typeof renderWithHome>["store"]) => {
  const sel = store.getState().selection;
  if (sel?.kind !== "transition") throw new Error("遷移が選ばれていない");
  return findTransition(store.getState().project, sel.key)!;
};

describe("遷移パネル", () => {
  it("トリガーを行クリック（新しい仮の表）にすると、表に移してパラメータを埋め、選び直す", () => {
    const { store } = renderWithHome();
    fireEvent.click(within(panel()).getByLabelText("行クリック（T2）"));
    fireEvent.change(within(panel()).getByLabelText("トリガーの表"), { target: { value: "" } });
    fireEvent.change(within(panel()).getByLabelText("トリガーのエンティティ"), {
      target: { value: "Device" },
    });
    fireEvent.click(within(panel()).getByRole("button", { name: "トリガーを変更" }));
    const t = transitionOf(store);
    expect(t).toMatchObject({
      from: "home",
      node: "table",
      event: "rowClick",
      params: { deviceId: "{{ event.row.id }}" },
    });
    expect((within(panel()).getByLabelText("渡す値 deviceId") as HTMLInputElement).value).toBe(
      "{{ event.row.id }}",
    );
  });

  it("ボタンの文言・渡す値・遷移先を変える", () => {
    const { store } = renderWithHome();
    const label = within(panel()).getByLabelText("ボタンの文言");
    fireEvent.change(label, { target: { value: "詳しく" } });
    fireEvent.blur(label);
    const param = within(panel()).getByLabelText("渡す値 deviceId");
    fireEvent.change(param, { target: { value: "dev-001" } });
    fireEvent.blur(param);
    expect(transitionOf(store)).toMatchObject({ label: "詳しく", params: { deviceId: "dev-001" } });
    fireEvent.change(within(panel()).getByLabelText("遷移先"), {
      target: { value: "deviceDelete" },
    });
    expect(transitionOf(store)).toMatchObject({ kind: "openDialog", to: "deviceDelete" });
  });

  it("付随アクションを足し、JSON で直す（スキーマに合わなければ理由を出す）", () => {
    const { store } = renderWithHome();
    const group = within(panel()).getByRole("group", { name: "付随アクション" });
    fireEvent.change(within(group).getByLabelText("付随アクションに追加"), {
      target: { value: "setState" },
    });
    expect(transitionOf(store).key).toBe("home:btn1:click:0");
    const json = within(group).getByLabelText("アクションの JSON") as HTMLTextAreaElement;
    fireEvent.change(json, {
      target: { value: '{ "type": "setState", "path": "1bad", "value": 1 }' },
    });
    fireEvent.click(within(group).getByRole("button", { name: "確定" }));
    expect(within(group).getByText(/path:/)).toBeTruthy();
    // 遷移の前に移す
    fireEvent.click(within(group).getByRole("button", { name: "2 番目を上へ" }));
    expect(transitionOf(store).key).toBe("home:btn1:click:1");
    expect(
      store.getState().project.screens[3]!.root!.children![0]!.events!.click!.map((a) => a.type),
    ).toEqual(["setState", "navigate"]);
  });
});

describe("画面・ダイアログのパネルの入出力", () => {
  it("ダイアログの呼び出し元と、画面の入出力を出し、選ぶと遷移を開く", () => {
    const store = createEditorStore({ project: loadExample(), view: "flow" });
    render(
      <EditorContext.Provider value={store}>
        <App />
      </EditorContext.Provider>,
    );
    act(() => store.getState().select({ kind: "container", id: "deviceDelete" }));
    const callers = screen.getByRole("list", { name: "呼び出し元" });
    expect(
      within(callers)
        .getAllByRole("button")
        .map((b) => b.textContent),
    ).toEqual(["機器詳細 →削除"]);
    expect(
      within(screen.getByRole("list", { name: "出ていく遷移" })).getByText("→ 機器一覧"),
    ).toBeTruthy();
    fireEvent.click(within(callers).getByRole("button"));
    expect(store.getState().selection).toEqual({
      kind: "transition",
      key: "deviceDetail:delete:click:0",
    });
  });
});
