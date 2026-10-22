import { describe, expect, it } from "vitest";
import { loadExample } from "../example";
import { issueTarget } from "./issue-target";

describe("issueTarget", () => {
  const project = loadExample();
  it("問題の場所から開くビューと選ぶものを決める", () => {
    expect(issueTarget(project, { path: ["entities", 0, "fields", 1, "type"] })).toEqual({
      view: "er",
      selection: { kind: "entity", id: "Device", field: "name" },
    });
    expect(issueTarget(project, { path: ["data", "Device", 0, "alarms", 1, "level"] })).toEqual({
      view: "data",
      selection: { kind: "data", entity: "Device" },
    });
    expect(issueTarget(project, { path: ["dialogs", 1, "root", "id"] })).toEqual({
      view: "flow",
      selection: { kind: "container", id: "deviceDelete" },
    });
    expect(issueTarget(project, { path: ["layout", "er", "X"] })).toEqual({
      view: "er",
      selection: null,
    });
    expect(issueTarget(project, { path: ["state", "selection"] })).toBeUndefined();
    // 遷移のアクションを指す問題は、その遷移を開く
    expect(
      issueTarget(project, { path: ["screens", 0, "root", "children", 3, "events", "click", 0] }),
    ).toEqual({
      view: "flow",
      selection: { kind: "transition", key: "dashboard:toDevices:click:0" },
    });
  });
});
