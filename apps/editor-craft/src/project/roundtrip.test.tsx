// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "../App";
import { listDocs } from "./documents";
import { EXAMPLE_FILENAME, loadExampleProject } from "./example";
import exampleJson from "../../../../packages/schema/examples/device-monitor.project.json?raw";
import exampleYaml from "../../../../packages/schema/examples/device-monitor.project.yaml?raw";

/**
 * 題材ファイル → Craft.js（実際の <Editor> に読み込む）→ P0 形式で保存、で内容が保たれること。
 * 題材ファイル自体が serializeProject の出力なので、保存したテキストはファイルと一致するはず。
 */

afterEach(cleanup);

function renderApp() {
  const download = vi.fn<(filename: string, text: string) => void>();
  render(
    <App
      initialProject={loadExampleProject()}
      initialFilename={EXAMPLE_FILENAME}
      onDownload={download}
    />,
  );
  const toolbar = document.querySelector(".toolbar") as HTMLElement;
  const save = (label: string) => {
    fireEvent.click(within(toolbar).getByRole("button", { name: label }));
    const call = download.mock.calls.at(-1)!;
    return { filename: call[0], text: call[1] };
  };
  /** すべての画面・コンポーネント・ダイアログを Craft に読み込む（読み込むたびに P0 形式へ書き戻される）。 */
  const openAllDocs = () => {
    // 最初の画面は起動時に Frame に読み込んだだけなので、最後にもう一度開き直す
    const docs = listDocs(loadExampleProject());
    for (const doc of [...docs.slice(1), docs[0]!]) {
      fireEvent.click(within(toolbar).getByRole("button", { name: doc.label }));
      const root = document.querySelector(`.canvas-frame [data-node-id="${doc.root.id}"]`);
      expect(root, `${doc.label} のルート`).toBeTruthy();
    }
  };
  return { toolbar, save, openAllDocs };
}

describe("読込 → 保存（Craft.js を通した往復）", () => {
  it("全ドキュメントを開いてから JSON で保存すると題材ファイルと一致する", () => {
    const { save, openAllDocs } = renderApp();
    openAllDocs();
    const saved = save("JSON で保存");
    expect(saved.filename).toBe("device-monitor.project.json");
    expect(saved.text).toBe(exampleJson);
    expect(screen.getByRole("status").textContent).toContain("を保存しました");
    expect(screen.getByRole("status").textContent).not.toContain("検証の問題");
  });

  it("YAML で保存すると題材の YAML と一致する", () => {
    const { save, openAllDocs } = renderApp();
    openAllDocs();
    expect(save("YAML で保存").text).toBe(exampleYaml);
  });

  it("YAML ファイルを開いて JSON で保存しても内容が保たれる", async () => {
    const { save, openAllDocs } = renderApp();
    const input = screen.getByLabelText("プロジェクトファイル") as HTMLInputElement;
    const file = new File([exampleYaml], "device-monitor.project.yaml");
    fireEvent.change(input, { target: { files: [file] } });
    await waitFor(() =>
      expect(screen.getByRole("status").textContent).toContain("を読み込みました"),
    );
    openAllDocs();
    const saved = save("JSON で保存");
    expect(saved.filename).toBe("device-monitor.project.json");
    expect(saved.text).toBe(exampleJson);
  });

  it("編集した内容が保存に反映される", () => {
    const { save } = renderApp();
    const palette = document.querySelector(".palette") as HTMLElement;
    fireEvent.click(within(palette).getByRole("button", { name: "Text" }));
    const saved = JSON.parse(save("JSON で保存").text) as {
      screens: { root: { children: { id: string; type: string; props?: unknown }[] } }[];
    };
    expect(saved.screens[0]!.root.children.at(-1)).toEqual({
      id: "text1",
      type: "Text",
      props: { text: "テキスト" },
    });
  });

  it("読めないファイルはエラーを表示し、開いているプロジェクトはそのまま", async () => {
    renderApp();
    const input = screen.getByLabelText("プロジェクトファイル") as HTMLInputElement;
    fireEvent.change(input, {
      target: { files: [new File(['{"schemaVersion":"0"}'], "broken.json")] },
    });
    await waitFor(() => expect(screen.getByRole("status").textContent).toContain("読み込めません"));
    expect(document.querySelector(".toolbar-filename")?.textContent).toBe(EXAMPLE_FILENAME);
  });
});
