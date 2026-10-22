import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "../App";
import { EXAMPLE_FILE_NAME, loadExample } from "../example";
import { memoryDirectory } from "../state/memory-directory.test-util";
import { createEditorStore, EditorContext } from "../state/store";

type PickerWindow = Window & { showDirectoryPicker?: unknown };

afterEach(() => {
  cleanup();
  delete (window as PickerWindow).showDirectoryPicker;
  vi.restoreAllMocks();
});

function renderEditor() {
  const store = createEditorStore({ project: loadExample() });
  act(() => store.getState().markSaved({ name: EXAMPLE_FILE_NAME }));
  render(
    <EditorContext.Provider value={store}>
      <App />
    </EditorContext.Provider>,
  );
  return store;
}

describe("ヘッダーの「コードを書き出す」", () => {
  it("フォルダを選べるなら、そのフォルダに書く（空でなければ確かめる）", async () => {
    const { dir, files } = memoryDirectory("device-monitor");
    (window as PickerWindow).showDirectoryPicker = vi.fn(async () => dir);
    renderEditor();
    fireEvent.click(screen.getByRole("button", { name: "コードを書き出す" }));
    await waitFor(
      () => expect(screen.getByRole("status").textContent).toContain("書き出しました"),
      {
        timeout: 5000,
      },
    );
    expect(files.get("src/App.tsx")).toContain("BrowserRouter");
    const count = files.size;
    // 2 回目は空でないので確かめる
    fireEvent.click(screen.getByRole("button", { name: "コードを書き出す" }));
    const confirm = await screen.findByRole("alertdialog", {}, { timeout: 5000 });
    expect(confirm.textContent).toContain("既にファイルがあります");
    fireEvent.click(screen.getByRole("button", { name: "上書きして書き出す" }));
    await waitFor(() => expect(screen.getByRole("status").textContent).toContain("書き出しました"));
    expect(files.size).toBe(count);
  });

  it("選べないブラウザでは zip をダウンロードする", async () => {
    // jsdom には URL.createObjectURL が無いので置く
    const created = vi.fn<(blob: Blob) => string>(() => "blob:zip");
    URL.createObjectURL = created;
    URL.revokeObjectURL = vi.fn();
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    renderEditor();
    fireEvent.click(screen.getByRole("button", { name: "コードを書き出す" }));
    await waitFor(
      () => expect(screen.getByRole("status").textContent).toContain("device-monitor.zip"),
      {
        timeout: 5000,
      },
    );
    expect(click).toHaveBeenCalled();
    expect(created.mock.calls[0]![0].type).toBe("application/zip");
  });
});
