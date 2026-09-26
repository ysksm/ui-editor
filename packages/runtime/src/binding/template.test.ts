import { describe, expect, it } from "vitest";
import { collectBindings } from "./collect.js";
import { exampleProject } from "../example.test-util.js";
import { analyzeExpression, unknownNames } from "./expression.js";
import { createScope, extendScope } from "./scope.js";
import { evaluateTemplate, resolveValue } from "./template.js";

const scope = createScope({
  data: { devices: [{ id: "a", name: "A", tags: ["x"] }] },
  state: { n: 3, obj: { k: 1 } },
  locals: { device: { id: "a", name: "A" } },
});

describe("evaluateTemplate", () => {
  it("returns the raw value for a whole binding", () => {
    expect(evaluateTemplate("{{ data.devices }}", scope).value).toEqual([
      { id: "a", name: "A", tags: ["x"] },
    ]);
    expect(evaluateTemplate(" {{ state.n }} ", scope).value).toBe(3);
  });

  it("interpolates into a string", () => {
    expect(evaluateTemplate("{{ state.n }} 台 / {{ device.name }}", scope).value).toBe("3 台 / A");
    expect(evaluateTemplate("[{{ null }}{{ undefined }}] {{ state.obj }}", scope).value).toBe(
      '[] {"k":1}',
    );
    expect(evaluateTemplate("plain", scope)).toEqual({ value: "plain", errors: [] });
  });

  it("reports errors and keeps going", () => {
    expect(evaluateTemplate("x={{ nope }}, n={{ state.n }}", scope)).toEqual({
      value: "x=, n=3",
      errors: [{ expression: "nope", error: "nope は定義されていません" }],
    });
    expect(evaluateTemplate("{{ state.a.b }}", scope)).toMatchObject({
      value: undefined,
      errors: [{ expression: "state.a.b" }],
    });
  });
});

describe("resolveValue", () => {
  it("resolves strings inside objects and arrays", () => {
    const s = extendScope(scope, { event: { value: "new" } });
    expect(
      resolveValue(
        { id: "{{ device.id }}", list: ["{{ state.n }}", 1, true, null], v: "{{ event.value }}" },
        s,
      ),
    ).toEqual({ value: { id: "a", list: [3, 1, true, null], v: "new" }, errors: [] });
  });
});

describe("example project bindings", () => {
  it("are all valid expressions that only use names available where they are written", () => {
    const sites = collectBindings(exampleProject());
    expect(sites.length).toBeGreaterThan(60);
    const problems = sites.flatMap((s) => {
      const error = analyzeExpression(s.expression).error;
      const unknown = unknownNames(s.expression, s.names);
      return error || unknown.length > 0
        ? [`${s.location}: ${s.expression} → ${error ?? unknown.join(", ")}`]
        : [];
    });
    expect(problems).toEqual([]);
  });

  it("gives loop variables, row and event only where they apply", () => {
    const sites = collectBindings(exampleProject());
    const find = (location: string) => sites.find((s) => s.location === location)?.names;
    expect(find("screen:dashboard / deviceCard / repeat.each")).toEqual([
      "data",
      "state",
      "params",
    ]);
    expect(find("screen:dashboard / deviceName / props.text")).toEqual([
      "data",
      "state",
      "params",
      "device",
      "index",
    ]);
    expect(find("screen:devices / deviceTable / props.columns[0].value")).toContain("row");
    expect(find("screen:devices / deviceTable / events.rowClick[0].params.deviceId")).toContain(
      "event",
    );
    expect(find("component:StatusBadge / badge / props.text")).toEqual(["data", "state", "props"]);
  });
});
