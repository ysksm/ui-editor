import { checkSampleData, parseDataModel } from "@ui-editor/runtime";
import { describe, expect, it } from "vitest";
import { loadExampleProject } from "./example";
import { fileNameFor, projectFromText, projectToText } from "./project-file";
import { setField } from "./sample-data/edit";

describe("project file", () => {
  it("saves edited sample data in P0 format and reads it back", () => {
    const project = loadExampleProject();
    const edited = {
      ...project,
      sampleData: setField(project.sampleData, "alarms", 0, "acknowledged", true),
    };
    for (const format of ["yaml", "json"] as const) {
      const text = projectToText(edited, format);
      if (!text.ok) throw new Error(text.errors.join("\n"));
      const loaded = projectFromText(text.value, `a.project.${format}`);
      if (!loaded.ok) throw new Error(loaded.errors.join("\n"));
      expect(loaded.value.sampleData).toEqual(edited.sampleData);
    }
  });

  it("saves the unedited example byte-for-byte", async () => {
    const { default: original } =
      await import("../../../packages/schema/examples/device-monitor.project.yaml?raw");
    expect(projectToText(loadExampleProject(), "yaml")).toEqual({ ok: true, value: original });
  });

  it("saves values that do not match the types (they are only warnings)", () => {
    const project = loadExampleProject();
    const sampleData = setField(project.sampleData, "devices", 0, "status", "broken");
    const decls = parseDataModel(project.dataModel.source).declarations;
    expect(checkSampleData(sampleData, decls).flatMap((c) => c.issues)).toHaveLength(1);
    expect(projectToText({ ...project, sampleData }, "yaml").ok).toBe(true);
  });

  it("reports invalid files", () => {
    const result = projectFromText("schemaVersion: '9'", "x.yaml");
    expect(result.ok).toBe(false);
    expect(projectFromText("{}", "x.txt")).toEqual({
      ok: false,
      errors: ["拡張子から形式を判定できません: x.txt"],
    });
    expect(fileNameFor("device-monitor.project.yaml", "json")).toBe("device-monitor.project.json");
  });
});
