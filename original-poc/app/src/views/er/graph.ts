import type { Entity, Field, Issue, Position, Project } from "@ui-editor/poc-model";
import { autoLayout } from "../../layout/dagre";

/** ER 図のノードとエッジ（React Flow に渡す前の、UI に依存しない形）。 */

export const ENTITY_WIDTH = 230;
const HEADER_HEIGHT = 40;
const ROW_HEIGHT = 22;

export function entityHeight(entity: Entity): number {
  return HEADER_HEIGHT + ROW_HEIGHT * entity.fields.length + 8;
}

/** IE 記法の線端（markers.tsx の id）。 */
export type IeMarker = "ie-one" | "ie-zero-one" | "ie-zero-many";

export interface ErNodeData extends Record<string, unknown> {
  entity: Entity;
  /** 主キーが表示用フィールドか、など表示の補助ではなく、検証の問題の件数。 */
  issueCount: number;
}

export interface ErEdgeData extends Record<string, unknown> {
  kind: "nest" | "ref";
  /** 線を持つフィールド（入れ子なら親の children、参照なら子の ref）。 */
  entity: string;
  field: string;
  label: string;
  start: IeMarker;
  end: IeMarker;
}

export interface ErGraph {
  nodes: { id: string; position: Position; data: ErNodeData }[];
  edges: { id: string; source: string; target: string; data: ErEdgeData }[];
}

/** フィールドの型を短く表した文字列（ノードの各行に出す）。 */
export function fieldTypeLabel(f: Field): string {
  switch (f.type) {
    case "id":
      return "PK";
    case "ref":
      return `→ ${f.entity ?? "?"}`;
    case "children":
      return (f.cardinality ?? "many") === "one"
        ? `⊃ ${f.entity ?? "?"}`
        : `⊃ ${f.entity ?? "?"}[]`;
    case "enum":
      return `enum(${(f.values ?? []).join("|")})`;
    default:
      return f.format ? `${f.type}・${f.format}` : f.type;
  }
}

/**
 * プロジェクトから ER 図を作る。保存した位置（layout.er）が無いエンティティは dagre で配置する。
 * - 入れ子（children）: 親 → 子。親の側は「1」、子の側は「0 以上」（1 件だけなら「0 か 1」）
 * - 参照（ref）: 参照する側 → 参照先。参照する側は「0 以上」、参照先の側は必須なら「1」、そうでなければ「0 か 1」
 */
export function erGraph(project: Project, issues: readonly Issue[]): ErGraph {
  const counts = new Map<number, number>();
  for (const i of issues) {
    if (i.path[0] === "entities" && typeof i.path[1] === "number") {
      counts.set(i.path[1], (counts.get(i.path[1]) ?? 0) + 1);
    }
  }
  const ids = new Set(project.entities.map((e) => e.id));
  const edges: ErGraph["edges"] = [];
  for (const e of project.entities) {
    for (const f of e.fields) {
      if (!f.entity || !ids.has(f.entity)) continue;
      if (f.type === "children") {
        edges.push({
          id: `nest:${e.id}.${f.id}`,
          source: e.id,
          target: f.entity,
          data: {
            kind: "nest",
            entity: e.id,
            field: f.id,
            label: f.id,
            start: "ie-one",
            end: (f.cardinality ?? "many") === "one" ? "ie-zero-one" : "ie-zero-many",
          },
        });
      } else if (f.type === "ref") {
        edges.push({
          id: `ref:${e.id}.${f.id}`,
          source: e.id,
          target: f.entity,
          data: {
            kind: "ref",
            entity: e.id,
            field: f.id,
            label: f.id,
            start: "ie-zero-many",
            end: f.required ? "ie-one" : "ie-zero-one",
          },
        });
      }
    }
  }
  const saved = project.layout?.er ?? {};
  const missing = project.entities.some((e) => !saved[e.id]);
  const auto = missing
    ? autoLayout(
        project.entities.map((e) => ({ id: e.id, width: ENTITY_WIDTH, height: entityHeight(e) })),
        edges,
      )
    : {};
  return {
    nodes: project.entities.map((entity, i) => ({
      id: entity.id,
      position: saved[entity.id] ?? auto[entity.id] ?? { x: 0, y: 0 },
      data: { entity, issueCount: counts.get(i) ?? 0 },
    })),
    edges,
  };
}

/** すべてのエンティティを自動配置した位置（「整列」用）。 */
export function erAutoPositions(project: Project): Record<string, Position> {
  return autoLayout(
    project.entities.map((e) => ({ id: e.id, width: ENTITY_WIDTH, height: entityHeight(e) })),
    erGraph(project, []).edges,
  );
}

/** 新しいエンティティを置く位置（既存のノードの右）。 */
export function nextEntityPosition(project: Project): Position {
  const positions = erGraph(project, []).nodes.map((n) => n.position);
  if (positions.length === 0) return { x: 40, y: 40 };
  return {
    x: Math.max(...positions.map((p) => p.x)) + ENTITY_WIDTH + 60,
    y: Math.min(...positions.map((p) => p.y)),
  };
}
