// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { validateProject, type Node, type Project } from "@ui-editor/schema";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "../App";
import { loadExampleProject } from "../project/example";

afterEach(cleanup);

function setup() {
  const download = vi.fn<(filename: string, text: string) => void>();
  render(<App initialProject={loadExampleProject()} onDownload={download} />);
  const q = (selector: string) => document.querySelector(selector) as HTMLElement;
  const ui = {
    toolbar: () => q(".toolbar"),
    palette: () => q(".palette"),
    layers: () => q(".layers"),
    props: () => q(".sidebar--right"),
    canvas: () => q(".canvas-frame"),
    /** TextField は blur で確定する */
    commit: (el: HTMLElement, value: string) => {
      fireEvent.change(el, { target: { value } });
      fireEvent.blur(el);
    },
    openDoc: (label: string) =>
      fireEvent.click(within(ui.toolbar()).getByRole("button", { name: label })),
    createDoc: (kind: string, id: string, name: string) => {
      fireEvent.change(screen.getByLabelText("作る種類"), { target: { value: kind } });
      fireEvent.change(screen.getByLabelText("新しい id"), { target: { value: id } });
      fireEvent.change(screen.getByLabelText("新しい名前"), { target: { value: name } });
      fireEvent.click(screen.getByRole("button", { name: "作成" }));
    },
    addPart: (label: string) =>
      fireEvent.click(within(ui.palette()).getByRole("button", { name: label })),
    select: (nodeId: string) => fireEvent.click(within(ui.layers()).getByText(nodeId)),
    save: (): Project => {
      fireEvent.click(within(ui.toolbar()).getByRole("button", { name: "JSON で保存" }));
      return JSON.parse(download.mock.calls.at(-1)![1]) as Project;
    },
  };
  return ui;
}

const findNode = (root: Node, id: string): Node | undefined =>
  root.id === id ? root : root.children?.map((c) => findNode(c, id)).find(Boolean);

describe("コンポーネント／ダイアログの作成", () => {
  it("MetricCard 相当のコンポーネントを作り、S1 に配置できる", () => {
    const ui = setup();
    ui.createDoc("component", "KpiCard", "KPI カード");
    expect(within(ui.toolbar()).getByRole("button", { name: "KPI カード" }).className).toContain(
      "is-active",
    );

    // props を定義する
    const addProp = (name: string, type: string) => {
      fireEvent.change(screen.getByLabelText("追加する名前"), { target: { value: name } });
      fireEvent.change(screen.getByLabelText("追加する型"), { target: { value: type } });
      fireEvent.click(screen.getByRole("button", { name: "追加" }));
    };
    addProp("label", "string");
    addProp("value", "number");

    // カードの中身: ラベルと値の Text
    ui.select("root");
    ui.addPart("Text");
    ui.commit(within(ui.props()).getByDisplayValue("テキスト"), "{{ props.label }}");
    ui.select("root");
    ui.addPart("Text");
    ui.commit(within(ui.props()).getByDisplayValue("テキスト"), "{{ props.value }}");
    fireEvent.change(within(ui.props()).getByLabelText("fontSize"), { target: { value: "24" } });

    // S1 に置いて props を入れる
    ui.openDoc("ダッシュボード");
    ui.select("metricSection");
    ui.addPart("KpiCard（KPI カード）");
    ui.commit(within(ui.props()).getByDisplayValue("label"), "稼働台数");
    ui.commit(within(ui.props()).getByDisplayValue("0"), "{{ data.devices.length }}");
    expect(within(ui.canvas()).getByText("稼働台数")).toBeTruthy();
    expect(within(ui.canvas()).getByText("5")).toBeTruthy();

    const saved = ui.save();
    expect(validateProject(saved).success).toBe(true);
    expect(saved.components?.find((c) => c.id === "KpiCard")).toEqual({
      id: "KpiCard",
      name: "KPI カード",
      props: { label: { type: "string" }, value: { type: "number" } },
      root: {
        id: "root",
        type: "Box",
        style: { display: "flex", flexDirection: "column", gap: 4, padding: 16 },
        children: [
          { id: "text1", type: "Text", props: { text: "{{ props.label }}" } },
          {
            id: "text2",
            type: "Text",
            props: { text: "{{ props.value }}" },
            style: { fontSize: 24 },
          },
        ],
      },
    });
    const metricSection = findNode(saved.screens[0]!.root, "metricSection")!;
    expect(metricSection.children?.at(-1)).toEqual({
      id: "kpiCard1",
      type: "KpiCard",
      props: { label: "稼働台数", value: "{{ data.devices.length }}" },
    });
  });

  it("選択したパーツをコンポーネントにして、元の場所をインスタンスに置き換える", () => {
    const ui = setup();
    ui.select("header");
    fireEvent.change(screen.getByLabelText("コンポーネント id"), {
      target: { value: "PageHeader" },
    });
    fireEvent.click(screen.getByRole("button", { name: "コンポーネント化" }));
    // キャンバスの見た目は変わらない
    expect(within(ui.canvas()).getByText("ダッシュボード")).toBeTruthy();

    const saved = ui.save();
    expect(validateProject(saved).success).toBe(true);
    const header = saved.screens[0]!.root.children![0]!;
    expect(header).toEqual({ id: "header", type: "PageHeader" });
    const component = saved.components?.find((c) => c.id === "PageHeader");
    expect(component?.root.id).toBe("header");
    expect(component?.root.children?.map((c) => c.id)).toEqual(["title", "toDevices"]);

    // インスタンスからコンポーネントを開ける
    fireEvent.click(screen.getByRole("button", { name: "PageHeader を開く" }));
    expect(within(ui.toolbar()).getByRole("button", { name: "PageHeader" }).className).toContain(
      "is-active",
    );
  });

  it("ダイアログを作って編集し、ボタンのクリックで開くように設定できる", () => {
    const ui = setup();
    ui.createDoc("dialog", "deleteConfirm", "削除確認");
    ui.addPart("Text");
    ui.select("body");
    ui.addPart("Button");
    fireEvent.change(screen.getByLabelText("アクション"), { target: { value: "closeDialog" } });
    fireEvent.click(
      within(document.querySelector(".events-editor")!).getByRole("button", { name: "追加" }),
    );

    ui.openDoc("機器一覧");
    ui.select("toDashboard");
    fireEvent.change(screen.getByLabelText("アクション"), { target: { value: "openDialog" } });
    fireEvent.change(screen.getByLabelText("行き先"), { target: { value: "deleteConfirm" } });
    fireEvent.click(
      within(document.querySelector(".events-editor")!).getByRole("button", { name: "追加" }),
    );

    const saved = ui.save();
    expect(validateProject(saved).success).toBe(true);
    const dialog = saved.dialogs?.find((d) => d.id === "deleteConfirm");
    expect(dialog?.root.children?.map((c) => [c.id, c.type])).toEqual([
      ["text1", "Text"],
      ["button1", "Button"],
    ]);
    expect(dialog?.root.children?.[1]?.events).toEqual({ click: [{ type: "closeDialog" }] });
    const button = findNode(saved.screens[1]!.root, "toDashboard")!;
    expect(button.events?.click).toEqual([
      { type: "navigate", to: "dashboard" },
      { type: "openDialog", dialog: "deleteConfirm" },
    ]);
  });

  it("使えない id ではエラーを表示して作らない", () => {
    setup();
    fireEvent.change(screen.getByLabelText("作る種類"), { target: { value: "component" } });
    fireEvent.change(screen.getByLabelText("新しい id"), { target: { value: "MetricCard" } });
    fireEvent.click(screen.getByRole("button", { name: "作成" }));
    expect(screen.getByText("MetricCard は既にあります")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("新しい id"), { target: { value: "lower" } });
    fireEvent.click(screen.getByRole("button", { name: "作成" }));
    expect(screen.getByText(/PascalCase/)).toBeTruthy();
  });
});
