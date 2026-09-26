import type { Action } from "@ui-editor/schema";
import { describe, expect, it } from "vitest";
import { loadExampleProject } from "../example";
import { initPreview, previewReducer, screenUrl } from "./store";

const project = loadExampleProject();
const reduce = previewReducer(project);

describe("preview store", () => {
  it("records each fired event in the history and resets", () => {
    let s = initPreview(project);
    expect(s.rt.screen.id).toBe("dashboard");
    const go: Action[] = [
      { type: "navigate", to: "deviceSettings", params: { deviceId: "{{ event.row.id }}" } },
    ];
    s = reduce(s, {
      type: "fire",
      label: "deviceTable.rowClick",
      actions: go,
      context: { event: { row: { id: "dev-002" } } },
    });
    expect(s.rt.screen).toEqual({ id: "deviceSettings", params: { deviceId: "dev-002" } });
    expect(s.history[0]?.label).toBe("deviceTable.rowClick");
    expect(s.history[0]?.log.map((l) => l.action.type)).toEqual(["navigate", "mount", "setState"]);
    s = reduce(s, { type: "reset" });
    expect(s).toEqual(initPreview(project));
  });

  it("fills path params for the URL bar", () => {
    expect(screenUrl("/devices/:deviceId", { deviceId: "dev 1" })).toBe("/devices/dev%201");
    expect(screenUrl("/devices/:deviceId", {})).toBe("/devices/:deviceId");
  });
});
