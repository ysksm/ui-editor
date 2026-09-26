import { describe, expect, it } from "vitest";
import { parseLayout, serializeLayout } from "./layout-file";
import { autoLayout, mergePositions } from "./layout";

describe("layout", () => {
  it("自動配置は遷移の向きに左から右へ並べる", () => {
    const size = { width: 100, height: 80 };
    const pos = autoLayout(
      [
        { id: "a", size },
        { id: "b", size },
        { id: "c", size },
      ],
      [
        { source: "a", target: "b" },
        { source: "b", target: "c" },
        { source: "c", target: "a" },
      ],
    );
    expect(pos.a!.x).toBeLessThan(pos.b!.x);
    expect(pos.b!.x).toBeLessThan(pos.c!.x);
  });

  it("保存済みの位置を優先し、無いものは自動配置を使う", () => {
    expect(
      mergePositions(["a", "b"], { a: { x: 1, y: 1 }, b: { x: 2, y: 2 } }, { a: { x: 9, y: 9 } }),
    ).toEqual({ a: { x: 9, y: 9 }, b: { x: 2, y: 2 } });
  });

  it("配置ファイルは id 順・整数で書き出し、読み戻せる", () => {
    const text = serializeLayout({ b: { x: 1.4, y: 2.6 }, a: { x: 0, y: 0 } });
    expect(text).toBe(
      '{\n  "version": 1,\n  "positions": {\n    "a": {\n      "x": 0,\n      "y": 0\n    },\n    "b": {\n      "x": 1,\n      "y": 3\n    }\n  }\n}\n',
    );
    expect(parseLayout(text).positions.b).toEqual({ x: 1, y: 3 });
    expect(() => parseLayout("{}")).toThrow();
  });
});
