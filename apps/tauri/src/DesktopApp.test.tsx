// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { loadProject, serializeProject } from "@ui-editor/schema";
import { loadExampleProject } from "@ui-editor/editor-craft/src/project/example";
import { afterEach, describe, expect, it, vi, type Mock } from "vitest";
import { DesktopApp } from "./DesktopApp";
import { fileNameOf, siblingPath, type LocalFiles } from "./files";

afterEach(cleanup);

type Fake<K extends keyof LocalFiles> = Mock<LocalFiles[K]>;

function fakeFiles(overrides: { open?: LocalFiles["open"]; saveAs?: LocalFiles["saveAs"] } = {}): {
  open: Fake<"open">;
  saveAs: Fake<"saveAs">;
  write: Fake<"write">;
} {
  return {
    open: vi.fn(overrides.open ?? (async () => undefined)),
    saveAs: vi.fn(overrides.saveAs ?? (async () => undefined)),
    write: vi.fn<LocalFiles["write"]>(async () => {}),
  };
}

const canvas = () => document.querySelector(".canvas-frame") as HTMLElement;

describe("DesktopApp", () => {
  it("P3 のエディタで題材の S1 を開く", () => {
    render(<DesktopApp files={fakeFiles()} />);
    expect(within(canvas()).getByText("ダッシュボード")).toBeTruthy();
    expect(screen.getByText(/同梱の題材・未保存/)).toBeTruthy();
  });

  it("ローカルのファイルを開き、編集して同じパスに上書き保存する", async () => {
    const project = loadExampleProject();
    project.name = "ローカルの題材";
    project.screens[0]!.name = "ホーム";
    const path = "/Users/me/work/local.project.yaml";
    const files = fakeFiles({
      open: async () => ({ path, text: serializeProject(project, "yaml") }),
    });
    render(<DesktopApp files={files} />);

    fireEvent.click(screen.getByRole("button", { name: "ローカルのファイルを開く…" }));
    await waitFor(() => expect(within(canvas()).getByText("ダッシュボード")).toBeTruthy());
    expect(screen.getByText("ローカルの題材")).toBeTruthy();
    expect(screen.getByRole("button", { name: "ホーム" })).toBeTruthy();
    expect(screen.getByText(path)).toBeTruthy();

    // パーツを足してから YAML で保存 → ダイアログは出さずに同じパスへ
    const palette = document.querySelector(".palette") as HTMLElement;
    fireEvent.click(within(palette).getByRole("button", { name: "Button" }));
    fireEvent.click(screen.getByRole("button", { name: "YAML で保存" }));
    await waitFor(() => expect(files.write).toHaveBeenCalledTimes(1));
    expect(files.saveAs).not.toHaveBeenCalled();
    const [writtenPath, text] = files.write.mock.calls[0]!;
    expect(writtenPath).toBe(path);
    const saved = loadProject(text, "yaml");
    expect(saved.success).toBe(true);
    expect(JSON.stringify(saved.success && saved.project.screens[0]!.root)).toContain("button1");
    expect(screen.getByText(`${path} に上書き保存しました`)).toBeTruthy();
  });

  it("形式を変えて保存するときと、同梱の題材を保存するときは保存先を聞く", async () => {
    const files = fakeFiles({
      saveAs: async (defaultPath) => `/Users/me/${defaultPath}`,
    });
    render(<DesktopApp files={files} />);

    fireEvent.click(screen.getByRole("button", { name: "JSON で保存" }));
    await waitFor(() => expect(files.saveAs).toHaveBeenCalledTimes(1));
    expect(files.saveAs.mock.calls[0]![0]).toBe("device-monitor.project.json");
    await waitFor(() =>
      expect(screen.getByText("/Users/me/device-monitor.project.json に保存しました")).toBeTruthy(),
    );

    // 2 回目は選んだパスに上書き
    fireEvent.click(screen.getByRole("button", { name: "JSON で保存" }));
    await waitFor(() => expect(files.write).toHaveBeenCalledTimes(1));
    expect(files.write.mock.calls[0]![0]).toBe("/Users/me/device-monitor.project.json");

    // YAML は別のファイルになるので、同じフォルダを初期値にして聞く
    fireEvent.click(screen.getByRole("button", { name: "YAML で保存" }));
    await waitFor(() => expect(files.saveAs).toHaveBeenCalledTimes(2));
    expect(files.saveAs.mock.calls[1]![0]).toBe("/Users/me/device-monitor.project.yaml");
  });

  it("検証を通らないファイルは開かずにエラーを出す", async () => {
    const files = fakeFiles({
      open: async () => ({ path: "/tmp/broken.json", text: '{"version": 1}' }),
    });
    render(<DesktopApp files={files} />);
    fireEvent.click(screen.getByRole("button", { name: "ローカルのファイルを開く…" }));
    await waitFor(() => expect(screen.getByText(/broken\.json を読み込めません/)).toBeTruthy());
    expect(within(canvas()).getByText("ダッシュボード")).toBeTruthy();
  });
});

describe("パスの扱い", () => {
  it("ファイル名とフォルダを取り出す", () => {
    expect(fileNameOf("/a/b/x.json")).toBe("x.json");
    expect(fileNameOf("C:\\a\\x.yaml")).toBe("x.yaml");
    expect(siblingPath("/a/b/x.json", "x.yaml")).toBe("/a/b/x.yaml");
    expect(siblingPath(undefined, "x.yaml")).toBe("x.yaml");
  });
});
