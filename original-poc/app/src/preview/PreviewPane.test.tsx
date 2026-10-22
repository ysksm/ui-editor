import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { App } from "../App";
import { loadExample } from "../example";
import { createEditorStore, EditorContext } from "../state/store";

afterEach(cleanup);

function renderWithPreview(view: "er" | "flow" = "er") {
  const store = createEditorStore({ project: loadExample(), view });
  render(
    <EditorContext.Provider value={store}>
      <App />
    </EditorContext.Provider>,
  );
  fireEvent.click(screen.getByRole("button", { name: "▶ プレビュー" }));
  return store;
}

const pane = () => screen.getByRole("complementary", { name: "プレビュー" });
const frame = (name: string) => within(pane()).getByRole("region", { name });

describe("プレビュー", () => {
  it("最初の画面から、ボタン・行クリックで辿り、戻れる", () => {
    renderWithPreview();
    expect(frame("画面: ダッシュボード")).toBeTruthy();
    fireEvent.click(within(pane()).getByRole("button", { name: "機器一覧へ" }));
    const list = frame("画面: 機器一覧");
    fireEvent.click(within(list).getByText("コアスイッチ B"));
    const detail = frame("画面: 機器詳細");
    expect(within(detail).getByRole("heading", { name: "コアスイッチ B" })).toBeTruthy();
    expect(within(detail).getByText("型番: CS-9000")).toBeTruthy();
    fireEvent.click(within(pane()).getByRole("button", { name: "戻る" }));
    expect(frame("画面: 機器一覧")).toBeTruthy();
  });

  it("ダイアログを重ねて表示し、閉じると呼び出し元に戻る。削除すると一覧から消える", () => {
    renderWithPreview();
    fireEvent.click(within(pane()).getByRole("button", { name: "機器一覧へ" }));
    fireEvent.click(within(frame("画面: 機器一覧")).getByText("無線 AP 2F"));
    fireEvent.click(within(frame("画面: 機器詳細")).getByRole("button", { name: "削除" }));
    const dialog = within(pane()).getByRole("dialog", { name: "削除の確認" });
    expect(dialog.textContent).toContain("「無線 AP 2F」を削除しますか？");
    fireEvent.click(within(dialog).getByRole("button", { name: "キャンセル" }));
    expect(within(pane()).queryByRole("dialog")).toBeNull();
    expect(frame("画面: 機器詳細")).toBeTruthy();
    fireEvent.click(within(frame("画面: 機器詳細")).getByRole("button", { name: "削除" }));
    fireEvent.click(
      within(within(pane()).getByRole("dialog")).getByRole("button", { name: "削除する" }),
    );
    const list = frame("画面: 機器一覧");
    expect(within(list).queryByText("無線 AP 2F")).toBeNull();
    // データをリセットすると戻る（元のサンプルデータは変わらない）
    fireEvent.click(within(pane()).getByRole("button", { name: "データをリセット" }));
    expect(within(frame("画面: 機器一覧")).getByText("無線 AP 2F")).toBeTruthy();
  });

  it("選択＋ボタン: 選ぶまで「編集」は押せない。フォームで直して保存すると一覧に反映される", () => {
    renderWithPreview();
    fireEvent.click(within(pane()).getByRole("button", { name: "機器一覧へ" }));
    const list = () => frame("画面: 機器一覧");
    const edit = () => within(list()).getByRole("button", { name: "編集" }) as HTMLButtonElement;
    expect(edit().disabled).toBe(true);
    fireEvent.click(within(list()).getByLabelText("dev-005 を選ぶ"));
    expect(edit().disabled).toBe(false);
    fireEvent.click(edit());
    const form = within(pane()).getByRole("dialog", { name: "機器の編集" });
    const name = within(form).getByLabelText("名前") as HTMLInputElement;
    expect(name.value).toBe("環境センサー サーバー室");
    fireEvent.change(name, { target: { value: "" } });
    fireEvent.click(within(form).getByRole("button", { name: "保存" }));
    expect(within(form).getByText("必須の項目です")).toBeTruthy();
    fireEvent.change(within(form).getByLabelText(/^名前/), { target: { value: "温度センサー" } });
    fireEvent.click(within(form).getByRole("button", { name: "保存" }));
    expect(within(pane()).queryByRole("dialog")).toBeNull();
    expect(within(list()).getByText("温度センサー")).toBeTruthy();
    fireEvent.click(within(pane()).getByRole("button", { name: /ログ/ }));
    expect(within(pane()).getByRole("list", { name: "ログ" }).textContent).toContain(
      "機器 dev-005 を保存",
    );
  });

  it("フロー図で、今いる画面とたどった遷移を強調する", () => {
    const store = renderWithPreview("flow");
    fireEvent.click(within(pane()).getByRole("button", { name: "機器一覧へ" }));
    const node = document.querySelector('[data-container="devices"]')!;
    expect(node.className).toContain("current");
    expect(document.querySelector('[data-container="dashboard"]')!.className).toContain("visited");
    act(() => store.getState().togglePreview(false));
    expect(document.querySelector('[data-container="devices"]')!.className).not.toContain(
      "current",
    );
  });
});
