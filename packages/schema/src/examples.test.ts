import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { sampleData } from "./domain/sample-data.js";
import { buildDeviceMonitorProject, DEVICE_MONITOR_EXAMPLE } from "./examples.js";
import { loadProject, serializeProject, type ProjectFormat } from "./project/io.js";
import type { Action, Node, Project } from "./project/schema.js";

const read = (file: string) =>
  readFileSync(new URL(`../examples/${file}`, import.meta.url), "utf8");

const formats = Object.entries(DEVICE_MONITOR_EXAMPLE.outputs) as [ProjectFormat, string][];

function load(format: ProjectFormat): Project {
  const result = loadProject(read(DEVICE_MONITOR_EXAMPLE.outputs[format]), format);
  if (!result.success) throw new Error(JSON.stringify(result.issues, null, 2));
  return result.project;
}

function* walk(node: Node): Generator<Node> {
  yield node;
  for (const child of node.children ?? []) yield* walk(child);
}

function allActions(project: Project): { from: string; action: Action }[] {
  const out: { from: string; action: Action }[] = [];
  const roots = [...project.screens, ...(project.dialogs ?? []), ...(project.components ?? [])];
  for (const owner of roots) {
    const events = "events" in owner ? [owner.events] : [];
    for (const node of walk(owner.root)) events.push(node.events);
    for (const e of events) {
      for (const actions of Object.values(e ?? {})) {
        for (const action of actions) out.push({ from: owner.id, action });
      }
    }
  }
  return out;
}

describe("device-monitor example", () => {
  it.each(formats)("%s version passes validation and is canonical", (format, file) => {
    const project = load(format);
    expect(serializeProject(project, format)).toBe(read(file));
  });

  it("JSON and YAML versions have the same content", () => {
    expect(load("json")).toEqual(load("yaml"));
  });

  it("is up to date with the source (run `pnpm --filter schema sync:examples`)", () => {
    const project = buildDeviceMonitorProject(read(DEVICE_MONITOR_EXAMPLE.source));
    for (const [format, file] of formats) {
      expect(serializeProject(project, format)).toBe(read(file));
    }
  });

  it("contains the sample data from #4 and the data model types", () => {
    const project = load("yaml");
    expect(project.sampleData).toEqual(sampleData);
    for (const name of ["DeviceStatus", "Device", "DeviceSettings", "Metric", "Alarm"]) {
      expect(project.dataModel.source).toMatch(new RegExp(`(interface|type) ${name}\\b`));
    }
  });

  it("describes S1–S3, D1, D2 and the three components", () => {
    const project = load("yaml");
    expect(project.screens.map((s) => s.id)).toEqual(["dashboard", "devices", "deviceSettings"]);
    expect(project.dialogs?.map((d) => d.id)).toEqual(["saveConfirm", "alarmDetail"]);
    expect(project.components?.map((c) => c.id)).toEqual(["StatusBadge", "MetricCard", "AlarmRow"]);
  });

  it("uses every action type, repeat and conditional rendering", () => {
    const project = load("yaml");
    const actions = allActions(project);
    expect(new Set(actions.map((a) => a.action.type))).toEqual(
      new Set(["navigate", "openDialog", "closeDialog", "setState", "updateData"]),
    );
    const nodes = [
      ...project.screens,
      ...(project.dialogs ?? []),
      ...(project.components ?? []),
    ].flatMap((o) => [...walk(o.root)]);
    expect(nodes.some((n) => n.repeat)).toBe(true);
    expect(nodes.some((n) => typeof n.visible === "string")).toBe(true);
  });

  it("has the transitions described in #1", () => {
    const edges = allActions(load("yaml")).flatMap(({ from, action }) =>
      action.type === "navigate"
        ? [`${from} -> ${action.to}`]
        : action.type === "openDialog"
          ? [`${from} -> ${action.dialog}`]
          : [],
    );
    expect(edges).toEqual(
      expect.arrayContaining([
        "devices -> deviceSettings", // S2 の行クリック → S3
        "deviceSettings -> saveConfirm", // S3 の保存 → D1
        "dashboard -> alarmDetail", // S1 のアラーム行 → D2
        "dashboard -> devices",
        "saveConfirm -> devices",
      ]),
    );
  });
});
