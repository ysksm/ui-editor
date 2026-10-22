import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { walkData } from "./data.js";
import { loadProject, serializeProject } from "./io.js";
import { formatIssue } from "./issues.js";

const text = readFileSync(
  new URL("../../../examples/device-monitor.poc.json", import.meta.url),
  "utf8",
);

describe("題材 examples/device-monitor.poc.json", () => {
  const loaded = loadProject(text);

  it("問題なく読み込める", () => {
    expect(loaded.success).toBe(true);
    if (loaded.success) expect(loaded.issues.map(formatIssue)).toEqual([]);
  });

  it("決定的な書き出しの形になっている（読み込み → 書き出しで変わらない）", () => {
    if (!loaded.success) throw new Error("読み込めない");
    expect(serializeProject(loaded.project)).toBe(text);
  });

  it("機器 5 件の下に設定・メトリクス・アラームが入れ子になっている", () => {
    if (!loaded.success) throw new Error("読み込めない");
    const count: Record<string, number> = {};
    walkData(loaded.project, ({ entity }) => (count[entity.id] = (count[entity.id] ?? 0) + 1));
    expect(count).toEqual({ Device: 5, DeviceSettings: 5, Metric: 15, Alarm: 10 });
    expect(Object.keys(loaded.project.data)).toEqual(["Device"]);
  });

  it("題材の 3 画面・2 ダイアログ", () => {
    if (!loaded.success) throw new Error("読み込めない");
    expect(loaded.project.screens.map((s) => s.id)).toEqual([
      "dashboard",
      "devices",
      "deviceDetail",
    ]);
    expect(loaded.project.dialogs.map((d) => d.id)).toEqual(["deviceEdit", "deviceDelete"]);
  });
});
