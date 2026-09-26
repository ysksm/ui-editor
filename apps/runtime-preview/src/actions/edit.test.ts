import { validateProject } from "@ui-editor/schema";
import { describe, expect, it } from "vitest";
import { loadExampleProject } from "../example";
import * as edit from "./edit";

const project = loadExampleProject();

describe("event edits", () => {
  it("reads events of screens and nodes", () => {
    expect(
      Object.keys(edit.eventsOf(project, { owner: { kind: "screen", id: "deviceSettings" } })),
    ).toEqual(["mount"]);
    expect(
      edit.eventsOf(project, { owner: { kind: "dialog", id: "alarmDetail" }, node: "acknowledge" })
        .click,
    ).toHaveLength(2);
    expect(
      edit.eventsOf(project, { owner: { kind: "component", id: "MetricCard" }, node: "card" }),
    ).toEqual({});
  });

  it("writes events back and keeps the project valid", () => {
    const target: edit.EventTarget = {
      owner: { kind: "component", id: "MetricCard" },
      node: "value",
    };
    let next = edit.setEvents(project, target, { click: [{ type: "navigate", to: "devices" }] });
    expect(edit.eventsOf(next, target)).toEqual({ click: [{ type: "navigate", to: "devices" }] });
    expect(validateProject(next).success).toBe(true);
    // 他の場所は変わらない（同じオブジェクトのまま）
    expect(next.screens).toBe(project.screens);

    next = edit.setEvents(next, target, { click: [] });
    expect(edit.findNode(next.components![1]!.root, "value")).not.toHaveProperty("events.click");
    expect(edit.findNode(next.components![1]!.root, "value")?.events).toBeUndefined();

    const screen: edit.EventTarget = { owner: { kind: "screen", id: "dashboard" } };
    next = edit.setEvents(project, screen, { mount: [edit.newAction("setState", project)] });
    expect(next.screens[0]!.events).toEqual({
      mount: [{ type: "setState", path: "draftSettings", value: "{{ event.value }}" }],
    });
    expect(validateProject(next).success).toBe(true);
  });

  it("creates valid actions of every type", () => {
    for (const type of edit.ACTION_TYPES) {
      const next = edit.setEvents(
        project,
        { owner: { kind: "screen", id: "devices" }, node: "title" },
        {
          click: [edit.newAction(type, project)],
        },
      );
      expect(validateProject(next).success, type).toBe(true);
    }
  });

  it("fills required params when the target changes", () => {
    expect(edit.newAction("openDialog", project)).toEqual({
      type: "openDialog",
      dialog: "saveConfirm",
      params: { deviceId: "" },
    });
    const defs = project.screens.find((s) => s.id === "deviceSettings")!.params;
    expect(
      edit.withParams(
        { type: "navigate", to: "deviceSettings", params: { deviceId: "{{ x }}", extra: 1 } },
        defs,
      ),
    ).toEqual({
      type: "navigate",
      to: "deviceSettings",
      params: { deviceId: "{{ x }}" },
    });
    expect(
      edit.withParams({ type: "navigate", to: "devices", params: { a: 1 } }, undefined),
    ).toEqual({
      type: "navigate",
      to: "devices",
      params: undefined,
    });
  });

  it("suggests event names by node type", () => {
    expect(edit.eventNamesFor(undefined)).toEqual(["mount"]);
    expect(edit.eventNamesFor({ id: "a", type: "Checkbox" })).toEqual(["change"]);
    expect(edit.eventNamesFor({ id: "a", type: "Table" })).toEqual(["rowClick"]);
    expect(edit.eventNamesFor({ id: "a", type: "AlarmRow" })).toEqual(["click"]);
  });

  it("parses and formats literal inputs", () => {
    expect(
      ["{{ event.value }}", "abc", "12", "true", "null", '"12"', "[1]"].map(edit.parseLiteral),
    ).toEqual(["{{ event.value }}", "abc", 12, true, null, "12", [1]]);
    expect([12, true, "abc", "12", null].map(edit.formatLiteral)).toEqual([
      "12",
      "true",
      "abc",
      '"12"',
      "null",
    ]);
    expect(edit.move([1, 2, 3], 0, 1)).toEqual([2, 1, 3]);
    expect(edit.move([1, 2, 3], 2, 1)).toEqual([1, 2, 3]);
  });
});
