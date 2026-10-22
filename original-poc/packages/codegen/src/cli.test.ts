import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { main } from "./cli.js";
import { appNameOf } from "./names.js";

const EXAMPLE = new URL("../../../examples/device-monitor.poc.json", import.meta.url).pathname;
const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

describe("poc-codegen（CLI）", () => {
  it("プロジェクトファイルから、指定したフォルダにアプリを書き出す", async () => {
    const dir = mkdtempSync(join(tmpdir(), "poc-codegen-"));
    dirs.push(dir);
    const out = join(dir, "app");
    const logs: string[] = [];
    const code = await main([EXAMPLE, "--out", out], (m) => logs.push(m));
    expect(code).toBe(0);
    expect(logs[0]).toMatch(/^\d+ ファイルを .*app に書き出しました。$/);
    expect(JSON.parse(readFileSync(join(out, "package.json"), "utf8")).name).toBe("device-monitor");
    expect(existsSync(join(out, "src/screens/DeviceDetailScreen.tsx"))).toBe(true);
  });

  it("引数が足りない・ファイルが読めないときは使い方・理由を出して 0 以外", async () => {
    const errors: string[] = [];
    expect(
      await main(
        [],
        () => {},
        (m) => errors.push(m),
      ),
    ).toBe(2);
    expect(errors[0]).toContain("使い方: poc-codegen");
    expect(
      await main(
        ["no-such.poc.json"],
        () => {},
        (m) => errors.push(m),
      ),
    ).toBe(1);
  });

  it("ファイル名からアプリ名", () => {
    expect(appNameOf("device-monitor.poc.json")).toBe("device-monitor");
    expect(appNameOf("My Project.json")).toBe("my-project");
    expect(appNameOf("機器.poc.json")).toBe("poc-app");
    expect(appNameOf(undefined)).toBe("poc-app");
  });
});
