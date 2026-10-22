import { describe, expect, it } from "vitest";
import { loadExample } from "../example";
import { CodeExportError, generateCode, isEmptyDirectory, writeToDirectory } from "./code-export";
import { memoryDirectory } from "./memory-directory.test-util";

describe("コードの書き出し", () => {
  it("題材からコードを生成する（アプリ名はファイル名から）", async () => {
    const { appName, files } = await generateCode(loadExample(), "device-monitor.poc.json");
    expect(appName).toBe("device-monitor");
    expect(files.map((f) => f.path)).toEqual(
      expect.arrayContaining(["package.json", "src/App.tsx", "src/screens/DeviceDetailScreen.tsx"]),
    );
  });

  it("検証エラーがあれば、場所付きの理由で CodeExportError", async () => {
    const broken = { ...loadExample(), entry: "nowhere" };
    const error = await generateCode(broken, undefined).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(CodeExportError);
    expect((error as CodeExportError).problems[0]).toContain("生成できません");
    expect((error as CodeExportError).problems.join("\n")).toContain("entry");
  });

  it("フォルダに書く（途中のフォルダは作る）。空かどうか", async () => {
    const { dir, files } = memoryDirectory();
    expect(await isEmptyDirectory(dir)).toBe(true);
    await writeToDirectory(dir, [
      { path: "package.json", content: "{}" },
      { path: "src/ui/Box.tsx", content: "export {};" },
    ]);
    expect([...files]).toEqual([
      ["package.json", "{}"],
      ["src/ui/Box.tsx", "export {};"],
    ]);
    expect(await isEmptyDirectory(dir)).toBe(false);
  });
});
