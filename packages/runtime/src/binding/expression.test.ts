import { describe, expect, it } from "vitest";
import { exampleProject } from "../example.test-util.js";
import { analyzeExpression, evaluateExpression, unknownNames } from "./expression.js";
import { createScope } from "./scope.js";

const project = exampleProject();
const scope = createScope({
  data: project.sampleData,
  state: { draftSettings: null },
  params: { deviceId: "dev-001", alarmId: "alm-001" },
});
const value = (expr: string, s = scope) => {
  const r = evaluateExpression(expr, s);
  if (!r.ok) throw new Error(r.error);
  return r.value;
};

describe("evaluateExpression", () => {
  it("evaluates the kinds of expressions used in the example", () => {
    expect(value("data.devices[0].name")).toBe("コアスイッチ A");
    expect(value("data.alarms.filter(a => !a.acknowledged).length")).toBeTypeOf("number");
    expect(value("data.devices.find(d => d.id === params.deviceId)?.name ?? params.deviceId")).toBe(
      "コアスイッチ A",
    );
    expect(value("({ online: 'オンライン', offline: 'オフライン' })[data.devices[0].status]")).toBe(
      "オンライン",
    );
    expect(value("Math.max(...[1, 5, 3])")).toBe(5);
    expect(
      value(
        "data.alarms.toSorted((a, b) => b.occurredAt.localeCompare(a.occurredAt)).slice(0, 2).length",
      ),
    ).toBe(2);
    expect(value("data.metrics.filter(m => m.deviceId === 'dev-001').at(-1)?.cpu")).toBeTypeOf(
      "number",
    );
    expect(
      value(
        "structuredClone(data.deviceSettings.find(s => s.deviceId === params.deviceId) ?? null)",
      ),
    ).toEqual(project.sampleData.deviceSettings?.[0]);
    expect(value("`${params.deviceId}!`")).toBe("dev-001!");
    expect(value("data.devices.map(({ id, name: n = id }) => n).length")).toBe(5);
  });

  it("returns runtime errors instead of throwing", () => {
    expect(evaluateExpression("state.draftSettings.network", scope)).toEqual({
      ok: false,
      error: expect.stringMatching(/^TypeError: /),
    });
  });

  it("only allows scope names and safe globals", () => {
    for (const expr of [
      "window.location",
      "fetch('/x')",
      "globalThis",
      "setTimeout(() => 1)",
      "document",
    ])
      expect(evaluateExpression(expr, scope)).toMatchObject({
        ok: false,
        error: expect.stringContaining("定義されていません"),
      });
    expect(evaluateExpression("props.x", scope)).toEqual({
      ok: false,
      error: "props は定義されていません",
    });
    expect(unknownNames("d => d.x + y", ["data"])).toEqual(["y"]);
  });

  it("rejects side effects, escapes and syntax errors", () => {
    const error = (expr: string) => analyzeExpression(expr).error;
    expect(error("state.x = 1")).toBe("式の中で代入はできません");
    expect(error("data.devices.length++")).toBe("式の中で ++ / -- は使えません");
    expect(error("delete data.devices")).toBe("式の中で delete は使えません");
    expect(error("(() => 1).constructor('return this')()")).toBe("constructor は参照できません");
    expect(error("data['__proto__']")).toBe("__proto__ は参照できません");
    expect(error("1), (2")).toBe("式を 1 つだけ書いてください");
    expect(error("1); fetch('x'); (1")).toMatch(/^構文エラー|式を 1 つだけ/);
    expect(error("data.")).toMatch(/^構文エラー/);
    expect(error("data as any")).toBe("TS の型の構文は使えません");
    expect(error("a ? b : c")).toBeUndefined();
  });

  it("collects free names but not lambda params or property names", () => {
    expect(analyzeExpression("data.devices.find(d => d.id === params.id)?.name").freeNames).toEqual(
      ["data", "params"],
    );
    expect(analyzeExpression("({ a: b, c, [d]: 1 })").freeNames).toEqual(["b", "c", "d"]);
  });
});
