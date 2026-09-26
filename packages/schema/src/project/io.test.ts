import { describe, expect, it } from "vitest";
import { miniProject } from "./fixture.test-util.js";
import {
  canonicalize,
  formatFromPath,
  loadProject,
  parseProjectText,
  ProjectParseError,
  serializeProject,
} from "./io.js";
import type { Project } from "./schema.js";

/** キーの順序を逆にしたコピー（内容は同じ）。 */
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

describe.each(["json", "yaml"] as const)("serializeProject (%s)", (format) => {
  it("is stable across repeated writes", () => {
    const first = serializeProject(miniProject(), format);
    const reloaded = loadProject(first, format);
    expect(reloaded.success).toBe(true);
    if (!reloaded.success) return;
    expect(serializeProject(reloaded.project, format)).toBe(first);
    expect(serializeProject(miniProject(), format)).toBe(first);
  });

  it("does not depend on the input key order", () => {
    const shuffled = reverseKeys(miniProject()) as Project;
    expect(serializeProject(shuffled, format)).toBe(serializeProject(miniProject(), format));
  });

  it("puts id/type first and children last", () => {
    const text = serializeProject(miniProject(), format);
    const node = format === "json" ? /"id": "root",\s+"type": "Box"/ : /id: root\n\s+type: Box/;
    expect(text).toMatch(node);
    expect(text.indexOf("sampleData")).toBeGreaterThan(text.indexOf("dialogs"));
  });
});

describe("format conversion", () => {
  it("round-trips JSON → YAML → JSON", () => {
    const json = serializeProject(miniProject(), "json");
    const viaYaml = parseProjectText(serializeProject(JSON.parse(json) as Project, "yaml"), "yaml");
    expect(serializeProject(viaYaml as Project, "json")).toBe(json);
  });

  it("quotes bindings in YAML and does not use anchors", () => {
    const p = miniProject();
    const shared = { display: "flex" as const };
    p.screens[0]!.root.style = shared;
    p.screens[1]!.root.style = shared;
    const yaml = serializeProject(p, "yaml");
    expect(yaml).toContain('"{{ item.id }}"');
    expect(yaml).not.toMatch(/[&*]a\d/);
  });

  it("canonicalize drops undefined values", () => {
    expect(canonicalize({ b: 1, a: undefined, id: "x" })).toEqual({ id: "x", b: 1 });
    expect(Object.keys(canonicalize({ b: 1, id: "x", a: 2 }) as object)).toEqual(["id", "a", "b"]);
  });
});

describe("parseProjectText", () => {
  it("explains unquoted bindings in YAML", () => {
    const yaml = "props:\n  text: {{ device.name }}\n";
    expect(() => parseProjectText(yaml, "yaml")).toThrow(/2 行目.*クォート/);
  });

  it("wraps syntax errors", () => {
    expect(() => parseProjectText("{", "json")).toThrow(ProjectParseError);
    expect(() => parseProjectText("a: [", "yaml")).toThrow(ProjectParseError);
  });

  it("detects the format from the file name", () => {
    expect(formatFromPath("app.project.json")).toBe("json");
    expect(formatFromPath("app.project.yml")).toBe("yaml");
    expect(formatFromPath("app.project.YAML")).toBe("yaml");
    expect(() => formatFromPath("app.txt")).toThrow(ProjectParseError);
  });
});

describe("parseProjectText: unquoted bindings", () => {
  it("finds them in flow mappings and sequences", () => {
    expect(() => parseProjectText("a: 1\nb: { text: {{ x }} }\n", "yaml")).toThrow(/2 行目/);
    expect(() => parseProjectText("a:\n  - {{ x }}\n", "yaml")).toThrow(/2 行目/);
  });

  it("ignores bindings inside quoted or plain strings", () => {
    expect(parseProjectText('a: "label: {{ x }}"\nb: 名前 {{ y }}\n', "yaml")).toEqual({
      a: "label: {{ x }}",
      b: "名前 {{ y }}",
    });
  });
});
