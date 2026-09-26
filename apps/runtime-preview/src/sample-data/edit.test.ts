import { parseDataModel } from "@ui-editor/runtime";
import { describe, expect, it } from "vitest";
import { loadExampleProject } from "../example";
import * as edit from "./edit";

const project = loadExampleProject();
const decls = parseDataModel(project.dataModel.source).declarations;
const fieldType = (model: string, field: string) => {
  const t = decls.find((d) => d.name === model)?.type;
  return t?.kind === "object" ? t.fields.find((f) => f.name === field)?.type : undefined;
};

describe("sample data edits", () => {
  it("sets, removes, adds, duplicates and deletes records immutably", () => {
    const data = project.sampleData;
    let next = edit.setField(data, "devices", 0, "name", "改名");
    expect((next.devices?.[0] as { name: string }).name).toBe("改名");
    expect((data.devices?.[0] as { name: string }).name).toBe("コアスイッチ A");

    next = edit.setField(next, "devices", 0, "firmware", undefined);
    expect(next.devices?.[0]).not.toHaveProperty("firmware");

    next = edit.duplicateRecord(next, "devices", 0);
    expect(next.devices?.[1]).toEqual(next.devices?.[0]);
    expect(next.devices?.[1]).not.toBe(next.devices?.[0]);

    next = edit.addRecord(next, "devices", { id: "new" });
    expect(next.devices?.at(-1)).toEqual({ id: "new" });
    next = edit.removeRecord(next, "devices", next.devices!.length - 1);
    expect(next.devices).toHaveLength(data.devices!.length + 1);
  });

  it("lists model fields first, then unknown keys", () => {
    expect(
      edit.columnsOf(
        [
          { b: 1, x: 2 },
          { a: 1, y: 3 },
        ],
        ["a", "b"],
      ),
    ).toEqual(["a", "b", "x", "y"]);
  });

  it("picks an editor from the field type", () => {
    expect(edit.editorFor(fieldType("Device", "name"), decls)).toEqual({ kind: "text" });
    expect(edit.editorFor(fieldType("Device", "status"), decls)).toEqual({
      kind: "select",
      options: ["online", "offline", "warning"],
    });
    expect(edit.editorFor(fieldType("Alarm", "acknowledged"), decls)).toEqual({ kind: "checkbox" });
    expect(edit.editorFor(fieldType("Metric", "cpu"), decls)).toEqual({ kind: "number" });
    expect(edit.editorFor(fieldType("DeviceSettings", "network"), decls)).toEqual({ kind: "json" });
    expect(edit.editorFor(undefined, decls)).toEqual({ kind: "json" });
  });

  it("parses JSON cells", () => {
    expect(edit.parseJsonCell('{"a":1}')).toEqual({ value: { a: 1 } });
    expect(edit.parseJsonCell("  ")).toEqual({ value: undefined });
    expect(edit.parseJsonCell("{")).toEqual({ error: "JSON として読めません" });
  });
});
