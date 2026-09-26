import { formatType, isModelDecl, parseDataModel } from "@ui-editor/runtime";
import { describe, expect, it } from "vitest";
import { loadExampleProject } from "../example";
import * as edit from "./edit";

const exampleDecls = () => parseDataModel(loadExampleProject().dataModel.source).declarations;

/** 編集結果を TS ソースに書き出して読み直す（UI と同じ流れ）。 */
const roundTrip = (decls: ReturnType<typeof exampleDecls>) =>
  parseDataModel(edit.printDataModel(decls));

describe("example project", () => {
  it("has the 4 data models", () => {
    expect(
      exampleDecls()
        .filter(isModelDecl)
        .map((d) => d.name),
    ).toEqual(["Device", "DeviceSettings", "Metric", "Alarm"]);
  });
});

describe("data model form edits", () => {
  it("adds a model and fields, and outputs TS", () => {
    const added = edit.addModel(exampleDecls());
    const name = added.name;
    let decls = added.decls;
    expect(name).toBe("NewModel");
    decls = edit.addField(decls, name);
    decls = edit.updateField(decls, name, 1, {
      name: "tags",
      typeText: "string[]",
      optional: true,
    });
    decls = edit.updateField(decls, name, 0, { description: "識別子" });
    decls = edit.renameDecl(decls, name, "Site");

    const printed = edit.printDataModel(decls);
    expect(printed).toContain(
      "interface Site {\n  /** 識別子 */\n  id: string;\n  tags?: string[];\n}\n",
    );
    const reparsed = roundTrip(decls);
    expect(reparsed.diagnostics).toEqual([]);
    expect(reparsed.declarations.filter(isModelDecl)).toHaveLength(5);
  });

  it("keeps an uninterpretable type as text so the source reports it", () => {
    const decls = edit.updateField(exampleDecls(), "Device", 1, { typeText: "string |" });
    const field = decls.find((d) => d.name === "Device")!;
    expect(field.type.kind === "object" && formatType(field.type.fields[1]!.type)).toBe("string |");
    expect(roundTrip(decls).diagnostics).not.toEqual([]);
  });

  it("moves and removes fields, removes a model", () => {
    let decls = edit.moveField(exampleDecls(), "Metric", 0, 1);
    decls = edit.removeField(decls, "Metric", 0);
    const metric = decls.find((d) => d.name === "Metric")!;
    expect(metric.type.kind === "object" && metric.type.fields.map((f) => f.name)).toEqual([
      "deviceId",
      "temperature",
      "cpu",
      "trafficMbps",
    ]);
    expect(edit.removeDecl(decls, "Metric").map((d) => d.name)).not.toContain("Metric");
    expect(edit.moveField(decls, "Metric", 0, -1)).toEqual(decls);
  });
});
