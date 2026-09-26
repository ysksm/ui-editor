import { describe, expect, it } from "vitest";
import { exampleProject } from "../example.test-util.js";
import { checkSampleData, checkValue, defaultValue, modelForCollection } from "./check.js";
import { parseDataModel } from "./parse.js";
import type { TypeRef } from "./types.js";

const decls = parseDataModel(exampleProject().dataModel.source).declarations;
const ref = (name: string): TypeRef => ({ kind: "ref", name });

describe("modelForCollection", () => {
  it("maps collection names to models by convention", () => {
    expect(
      ["devices", "deviceSettings", "metrics", "alarms", "unknowns"].map(
        (c) => modelForCollection(c, decls)?.name,
      ),
    ).toEqual(["Device", "DeviceSettings", "Metric", "Alarm", undefined]);
  });
});

describe("checkSampleData", () => {
  it("accepts the example sample data", () => {
    const result = checkSampleData(exampleProject().sampleData, decls);
    expect(result.map((r) => [r.collection, r.model, r.issues])).toEqual([
      ["alarms", "Alarm", []],
      ["deviceSettings", "DeviceSettings", []],
      ["devices", "Device", []],
      ["metrics", "Metric", []],
    ]);
  });

  it("reports mismatches with the record index", () => {
    const [devices] = checkSampleData(
      {
        devices: [
          { id: "x", name: 1, model: "m", status: "broken", ipAddress: "", firmware: "", extra: 0 },
          {},
        ],
      },
      decls,
    );
    expect(devices?.issues).toEqual([
      { path: [0, "name"], message: "string が必要ですが 1 です" },
      { path: [0, "status"], message: 'DeviceStatus が必要ですが "broken" です' },
      { path: [0, "extra"], message: "型に無いフィールドです" },
      ...["id", "name", "model", "status", "ipAddress", "firmware"].map((f) => ({
        path: [1, f],
        message: "必須のフィールドがありません",
      })),
    ]);
  });
});

describe("checkValue", () => {
  it("checks nested objects and nullable unions", () => {
    const settings = defaultValue(ref("DeviceSettings"), decls) as Record<string, unknown>;
    expect(checkValue(settings, ref("DeviceSettings"), decls)).toEqual([]);
    expect(
      checkValue(
        { ...settings, network: { dhcp: "yes", ip: "", subnet: "", gateway: "" } },
        ref("DeviceSettings"),
        decls,
      ),
    ).toEqual([{ path: ["network", "dhcp"], message: 'boolean が必要ですが "yes" です' }]);

    const nullable: TypeRef = {
      kind: "union",
      types: [ref("DeviceSettings"), { kind: "primitive", name: "null" }],
    };
    expect(checkValue(null, nullable, decls)).toEqual([]);
    expect(checkValue({ ...settings, pollingIntervalSec: "30" }, nullable, decls)).toEqual([
      { path: ["pollingIntervalSec"], message: 'number が必要ですが "30" です' },
    ]);
    expect(checkValue(3, nullable, decls)).toEqual([
      { path: [], message: "DeviceSettings | null が必要ですが 3 です" },
    ]);
  });
});

describe("defaultValue", () => {
  it("builds a value that satisfies the type", () => {
    expect(defaultValue(ref("Alarm"), decls)).toEqual({
      id: "",
      deviceId: "",
      level: "info",
      message: "",
      occurredAt: "",
      acknowledged: false,
    });
    for (const d of decls)
      expect(checkValue(defaultValue(d.type, decls), d.type, decls)).toEqual([]);
  });
});
