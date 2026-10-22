import { describe, expect, it } from "vitest";
import { loadExample } from "../../example";
import { erAutoPositions, erGraph, fieldTypeLabel, nextEntityPosition } from "./graph";

describe("erGraph", () => {
  const project = loadExample();

  it("入れ子は親 → 子の実線、線端は「1」と「0 以上 / 0 か 1」", () => {
    const g = erGraph(project, []);
    expect(g.nodes.map((n) => n.id)).toEqual(["Device", "DeviceSettings", "Metric", "Alarm"]);
    expect(g.edges.map((e) => [e.id, e.source, e.target, e.data.start, e.data.end])).toEqual([
      ["nest:Device.settings", "Device", "DeviceSettings", "ie-one", "ie-zero-one"],
      ["nest:Device.metrics", "Device", "Metric", "ie-one", "ie-zero-many"],
      ["nest:Device.alarms", "Device", "Alarm", "ie-one", "ie-zero-many"],
    ]);
  });

  it("参照は破線、参照先の側は必須なら「1」", () => {
    const p = structuredClone(project);
    p.entities[3]!.fields.push({ id: "ownerId", type: "ref", entity: "Device", required: true });
    const edge = erGraph(p, []).edges.at(-1)!;
    expect(edge).toMatchObject({ id: "ref:Alarm.ownerId", source: "Alarm", target: "Device" });
    expect(edge.data).toMatchObject({ kind: "ref", start: "ie-zero-many", end: "ie-one" });
  });

  it("保存した位置があればそれを使い、無ければ自動配置する。検証の問題の件数を数える", () => {
    const p = structuredClone(project);
    p.layout = { er: { Device: { x: 5, y: 6 } } };
    const g = erGraph(p, [{ path: ["entities", 0, "name"], message: "x", severity: "error" }]);
    expect(g.nodes[0]!.position).toEqual({ x: 5, y: 6 });
    expect(g.nodes[0]!.data.issueCount).toBe(1);
    expect(g.nodes[1]!.position).toEqual(erAutoPositions(p).DeviceSettings);
    // 新しいエンティティは既存のノードの右
    expect(nextEntityPosition(p).x).toBeGreaterThan(Math.max(...g.nodes.map((n) => n.position.x)));
  });

  it("フィールドの型の表示", () => {
    expect(fieldTypeLabel({ id: "id", type: "id" })).toBe("PK");
    expect(fieldTypeLabel({ id: "a", type: "children", entity: "Alarm" })).toBe("⊃ Alarm[]");
    expect(fieldTypeLabel({ id: "s", type: "children", entity: "S", cardinality: "one" })).toBe(
      "⊃ S",
    );
    expect(fieldTypeLabel({ id: "d", type: "ref", entity: "Device" })).toBe("→ Device");
    expect(fieldTypeLabel({ id: "ip", type: "string", format: "ipv4" })).toBe("string・ipv4");
  });
});
