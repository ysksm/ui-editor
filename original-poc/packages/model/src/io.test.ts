import { describe, expect, it } from "vitest";
import { smallProject } from "./fixture.test-util.js";
import {
  canonicalProject,
  createEmptyProject,
  loadProject,
  migrate,
  parseProjectText,
  ProjectParseError,
  serializeProject,
} from "./io.js";
import type { Project } from "./schema.js";
import { checkProject } from "./validate.js";

/** オブジェクトのキーの順序をすべて逆にした複製。 */
function reverseKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(reverseKeys);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .reverse()
        .map(([k, v]) => [k, reverseKeys(v)]),
    );
  }
  return value;
}

describe("serializeProject", () => {
  it("入力のキー順に関係なく同じテキストになる", () => {
    const p = smallProject();
    expect(serializeProject(reverseKeys(p) as Project)).toBe(serializeProject(p));
  });

  it("読み込み → 書き出し → 再読み込みで内容が変わらない", () => {
    const text = serializeProject(smallProject());
    const loaded = loadProject(text);
    expect(loaded.success).toBe(true);
    if (!loaded.success) return;
    expect(loaded.project).toEqual(canonicalProject(smallProject()));
    expect(serializeProject(loaded.project)).toBe(text);
  });

  it("先頭は schemaVersion・name、末尾は data・layout", () => {
    const keys = Object.keys(JSON.parse(serializeProject(smallProject())) as object);
    expect(keys.slice(0, 2)).toEqual(["schemaVersion", "name"]);
    expect(keys.slice(-2)).toEqual(["data", "layout"]);
  });

  it("レコードはエンティティのフィールド順（入れ子の中も）、定義に無いキーは後ろ", () => {
    const p = smallProject();
    p.data.Device = [
      {
        extra: 1,
        alarms: [{ acknowledged: true, message: "m", id: "alm-1" }],
        status: "online",
        name: "n",
        id: "dev-1",
      },
    ];
    const device = (JSON.parse(serializeProject(p)) as Project).data.Device![0]!;
    expect(Object.keys(device)).toEqual(["id", "name", "status", "alarms", "extra"]);
    expect(Object.keys((device.alarms as object[])[0]!)).toEqual(["id", "message", "acknowledged"]);
  });

  it("配置は id 順で整数に丸める", () => {
    const p = smallProject();
    p.layout = { flow: { b: { x: 1.6, y: 2.2 }, a: { x: -0.4, y: 10 } } };
    expect(JSON.parse(serializeProject(p)).layout).toEqual({
      flow: { a: { x: 0, y: 10 }, b: { x: 2, y: 2 } },
    });
    expect(Object.keys(JSON.parse(serializeProject(p)).layout.flow)).toEqual(["a", "b"]);
  });

  it("undefined のキーは書き出さない", () => {
    const p = smallProject();
    p.description = undefined;
    expect(serializeProject(p)).not.toContain("description");
  });
});

describe("loadProject", () => {
  it("JSON の構文エラーは ProjectParseError", () => {
    expect(() => parseProjectText("{ name: ")).toThrow(ProjectParseError);
    expect(() => loadProject("{")).toThrow(/JSON の構文エラー/);
  });

  it("形が壊れていれば読み込まず、参照の問題は読み込んだうえで返す", () => {
    expect(loadProject(JSON.stringify({ schemaVersion: "poc-0" })).success).toBe(false);
    const p = smallProject();
    p.entry = "nowhere";
    const r = loadProject(JSON.stringify(p));
    expect(r.success).toBe(true);
    if (r.success) expect(r.issues.map((i) => i.path)).toEqual([["entry"]]);
  });

  it("対応していない版は読み込まない", () => {
    const r = loadProject(JSON.stringify({ ...smallProject(), schemaVersion: "poc-9" }));
    expect(r).toEqual({
      success: false,
      issues: [
        {
          path: ["schemaVersion"],
          message: 'schemaVersion "poc-9" には対応していません（poc-0 のファイルを開いてください）',
          severity: "error",
        },
      ],
    });
  });
});

describe("migrate", () => {
  it("移行関数を順に通して今の版にする", () => {
    const migrations = {
      "poc-a": (raw: Record<string, unknown>) => ({
        ...raw,
        schemaVersion: "poc-b",
        title: undefined,
        name: raw.title,
      }),
      "poc-b": (raw: Record<string, unknown>) => ({ ...raw, schemaVersion: "poc-0" }),
    };
    const r = migrate(
      { ...smallProject(), name: undefined, schemaVersion: "poc-a", title: "旧名" },
      migrations,
    );
    expect(r.from).toBe("poc-a");
    expect(r.issues).toEqual([]);
    expect(r.value).toMatchObject({ schemaVersion: "poc-0", name: "旧名" });
  });

  it("移行が循環したら止める", () => {
    const r = migrate(
      { schemaVersion: "x" },
      {
        x: (raw) => ({ ...raw, schemaVersion: "y" }),
        y: (raw) => ({ ...raw, schemaVersion: "x" }),
      },
    );
    expect(r.issues[0]?.path).toEqual(["schemaVersion"]);
  });

  it("今の版はそのまま", () => {
    const p = smallProject();
    expect(migrate(p)).toEqual({ value: p, from: undefined, issues: [] });
  });
});

describe("createEmptyProject", () => {
  it("空のプロジェクトは問題が無い", () => {
    expect(checkProject(createEmptyProject())).toEqual([]);
    expect(loadProject(serializeProject(createEmptyProject())).success).toBe(true);
  });
});
