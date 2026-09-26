import { collectBindings, createScope, evaluateTemplate } from "@ui-editor/runtime";
import { describe, expect, it } from "vitest";
import { loadExampleProject } from "../example";
import { initialState, sampleLocals } from "./sample-scope";

const project = loadExampleProject();
const sites = collectBindings(project);
const site = (location: string) => sites.find((s) => s.location === location)!;

describe("sampleLocals", () => {
  it("fills params, loop variables and rows from the sample data", () => {
    expect(sampleLocals(project, site("dialog:alarmDetail / message / props.text"))).toEqual({
      params: { alarmId: "alm-001" },
    });
    expect(sampleLocals(project, site("screen:dashboard / deviceName / props.text"))).toMatchObject(
      {
        device: { id: "dev-001" },
        index: 0,
      },
    );
    expect(
      sampleLocals(project, site("screen:devices / deviceTable / props.columns[0].value")),
    ).toMatchObject({
      row: { id: "dev-001" },
    });
    expect(sampleLocals(project, site("component:AlarmRow / message / props.text"))).toMatchObject({
      props: { alarm: { id: "alm-001" }, deviceName: "" },
    });
    expect(sampleLocals(project, site("component:StatusBadge / badge / props.text"))).toEqual({
      props: { status: "online" },
    });
  });

  it("lets every example binding outside the settings form evaluate without errors", () => {
    const failures = sites
      // S3 のフォームは state.draftSettings（mount で入る）が前提なので除く
      .filter(
        (s) => !(s.owner.id === "deviceSettings" && s.expression.includes("state.draftSettings")),
      )
      .filter(
        (s) => !(s.owner.id === "saveConfirm" && s.expression.includes("state.draftSettings")),
      )
      .flatMap((s) => {
        const scope = createScope({
          data: project.sampleData,
          state: initialState(project),
          locals: sampleLocals(project, s),
        });
        const r = evaluateTemplate(`{{ ${s.expression} }}`, scope);
        return r.errors.map((e) => `${s.location}: ${e.error}`);
      });
    expect(failures).toEqual([]);
  });
});
