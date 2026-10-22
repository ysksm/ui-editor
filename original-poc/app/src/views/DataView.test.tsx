import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { listRecords } from "@ui-editor/poc-datastore";
import { afterEach, describe, expect, it } from "vitest";
import { App } from "../App";
import { loadExample } from "../example";
import { createEditorStore, EditorContext } from "../state/store";

afterEach(cleanup);

function renderData() {
  const store = createEditorStore({ project: loadExample(), view: "data" });
  render(
    <EditorContext.Provider value={store}>
      <App />
    </EditorContext.Provider>,
  );
  return store;
}

const tree = () => screen.getByRole("navigation", { name: "エンティティ" });

describe("データビュー", () => {
  it("エンティティの木（入れ子は字下げ・件数）と表を出す", () => {
    renderData();
    expect(
      within(tree())
        .getAllByRole("button")
        .map((b) => b.textContent),
    ).toEqual(["機器5", "└ 機器設定5", "└ メトリクス15", "└ アラーム10"]);
    const table = screen.getByRole("table", { name: "機器 のレコード" });
    expect(within(table).getAllByRole("row")).toHaveLength(6);
  });

  it("セルを直すと変える項目だけ検証して書き込む。誤りはその場で示す", () => {
    const store = renderData();
    fireEvent.change(screen.getByLabelText("dev-001 の 状態"), { target: { value: "offline" } });
    expect(store.getState().project.data.Device![0]!.status).toBe("offline");
    const name = screen.getByLabelText("dev-001 の 名前");
    fireEvent.change(name, { target: { value: "" } });
    fireEvent.blur(name);
    expect(screen.getByText("必須の項目です")).toBeTruthy();
    expect(store.getState().project.data.Device![0]!.name).toBe("コアスイッチ A");
    // 元に戻すで戻る
    fireEvent.click(screen.getByRole("button", { name: "↶ 元に戻す" }));
    expect(store.getState().project.data.Device![0]!.status).toBe("online");
  });

  it("入れ子のエンティティは親を選んで行を足す（必須は空のまま）", () => {
    const store = renderData();
    fireEvent.click(within(tree()).getByRole("button", { name: /アラーム/ }));
    fireEvent.change(screen.getByLabelText("追加先の機器"), { target: { value: "dev-002" } });
    fireEvent.click(screen.getByRole("button", { name: "＋ アラームを追加" }));
    const alarms = store.getState().project.data.Device![1]!.alarms as Record<string, unknown>[];
    expect(alarms.at(-1)).toEqual({
      id: "alm-011",
      level: null,
      message: "",
      occurredAt: "",
      acknowledged: false,
    });
    expect(store.getState().selection).toEqual({ kind: "data", entity: "Alarm", id: "alm-011" });
    // 必須の空欄は検証の問題になる
    expect(
      store
        .getState()
        .issues.some(
          (i) => i.path.join(".") === `data.Device.1.alarms.${alarms.length - 1}.message`,
        ),
    ).toBe(true);
  });

  it("行を消すと入れ子の子も消え、何が消えたかを示す", () => {
    const store = renderData();
    fireEvent.click(screen.getByRole("button", { name: "dev-003 を削除" }));
    const project = store.getState().project;
    expect(project.data.Device!.map((d) => d.id)).not.toContain("dev-003");
    expect(listRecords(project, project.data, "Alarm")).toHaveLength(8);
    expect(screen.getByRole("status").textContent).toContain(
      "機器「エッジルーター 1F」（機器設定 1 件、メトリクス 3 件、アラーム 2 件も）を削除しました",
    );
  });

  it("件数とシードを指定してサンプルデータを作る", () => {
    const store = renderData();
    fireEvent.click(screen.getByRole("button", { name: "サンプルデータを生成…" }));
    const dialog = screen.getByRole("dialog", { name: "サンプルデータの生成" });
    fireEvent.change(within(dialog).getByLabelText("機器の件数"), { target: { value: "5" } });
    fireEvent.change(within(dialog).getByLabelText("アラームの件数"), { target: { value: "20" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "生成して置き換える" }));
    const project = store.getState().project;
    expect(listRecords(project, project.data, "Device")).toHaveLength(5);
    expect(listRecords(project, project.data, "Alarm")).toHaveLength(20);
    expect(store.getState().issues).toEqual([]);
    expect(screen.getByRole("status").textContent).toContain(
      "機器 5 件、機器設定 5 件、メトリクス 15 件、アラーム 20 件",
    );
  });

  it("入れ子の木と JSON（平らな形は $parent 付き）", () => {
    const store = renderData();
    fireEvent.click(screen.getByRole("button", { name: "入れ子の木" }));
    const nested = screen.getByLabelText("入れ子の木");
    expect(within(nested).getByText("コアスイッチ A")).toBeTruthy();
    fireEvent.click(within(nested).getByText("設定が保存されました"));
    expect(store.getState().selection).toMatchObject({ kind: "data", entity: "Alarm" });
    fireEvent.click(screen.getByRole("button", { name: "JSON" }));
    fireEvent.click(screen.getByRole("button", { name: /平ら/ }));
    expect(screen.getByLabelText("データの JSON").textContent).toContain('"$parent": "dev-001"');
    act(() => store.getState().setView("er"));
  });
});
