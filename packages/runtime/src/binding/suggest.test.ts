import { describe, expect, it } from "vitest";
import { exampleProject } from "../example.test-util.js";
import { createScope } from "./scope.js";
import { suggest } from "./suggest.js";

const scope = createScope({
  data: exampleProject().sampleData,
  state: { draftSettings: null },
  params: { deviceId: "dev-001" },
});
const labels = (text: string) => suggest(text, scope).items.map((i) => i.label);

describe("suggest", () => {
  it("suggests scope names and globals at the start", () => {
    expect(labels("")).toEqual(expect.arrayContaining(["data", "state", "params", "Math"]));
    expect(labels("da")).toEqual(["data", "Date"].filter((l) => l.startsWith("da")));
    expect(suggest("1 + pa", scope).from).toBe(4);
    expect(labels("1 + pa")).toEqual(["params", "parseInt", "parseFloat"]);
  });

  it("walks the sample data", () => {
    expect(labels("data.")).toEqual(["alarms", "deviceSettings", "devices", "metrics"]);
    expect(labels("data.dev")).toEqual(["deviceSettings", "devices"]);
    expect(labels("data.devices.fi")).toEqual(["find", "filter", "findIndex"]);
    expect(labels("data.deviceSettings[0]")).toEqual([]);
    expect(suggest("state.draftSettings?.", scope).items).toEqual([]);
  });

  it("knows the element type of lambda params", () => {
    // サンプルデータのキーは正規化（アルファベット順）されている
    expect(labels("data.devices.find(d => d.")).toEqual([
      "id",
      "name",
      "firmware",
      "ipAddress",
      "model",
      "status",
    ]);
    expect(labels("data.devices.reduce((sum, d) => sum + d.ip")).toEqual(["ipAddress"]);
    expect(labels("data.alarms.toSorted((a, b) => b.occ")).toEqual(["occurredAt"]);
    expect(labels("data.devices.find(d => d.id === params.")).toEqual(["deviceId"]);
  });

  it("does not suggest after a call", () => {
    expect(labels("data.devices.at(0).")).toEqual([]);
  });
});
