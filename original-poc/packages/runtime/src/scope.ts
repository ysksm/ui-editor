import { compileEr, dataView, findRecord, type Dataset } from "@ui-editor/poc-datastore";
import { findContainer, type DataRecord, type JsonValue, type Project } from "@ui-editor/poc-model";
import { evaluateTemplate, resolveValue, type BindingError } from "@ui-editor/runtime";
import type { Frame, RuntimeState } from "./types.js";

/** 式の評価（P4 の `@ui-editor/runtime` を使う。architecture.md 4.6）。 */
export type Scope = Readonly<Record<string, unknown>>;
export type { BindingError };

export interface Evaluated<T = unknown> {
  value: T;
  errors: BindingError[];
}

/** `{{ }}` を含む文字列を評価する（全体が 1 つの式なら値そのもの）。 */
export function evaluate(text: string, scope: Scope): Evaluated {
  return evaluateTemplate(text, scope);
}

/** JSON の値の中の文字列をすべて評価する（props・アクションの引数）。 */
export function resolve(value: unknown, scope: Scope): Evaluated {
  return resolveValue(value, scope);
}

export function describeErrors(errors: readonly BindingError[]): string {
  return errors.map((e) => `{{ ${e.expression} }}: ${e.error}`).join("\n");
}

/**
 * 画面・ダイアログのレコード（`record`）。`entity` と同じエンティティを指す `ref` パラメータの値で引く
 * （architecture.md 3 章）。無ければ null。
 */
export function frameRecord(
  project: Project,
  data: Dataset,
  container: string,
  params: Readonly<Record<string, unknown>>,
): DataRecord | null {
  const c = findContainer(project, container)?.container;
  if (!c?.entity) return null;
  const param = Object.entries(c.params ?? {}).find(
    ([, def]) => def.type === "ref" && def.entity === c.entity,
  )?.[0];
  const id = param === undefined ? undefined : params[param];
  if (typeof id !== "string") return null;
  return findRecord(project, data, c.entity, id)?.record ?? null;
}

/**
 * 入れ子のエンティティを作るフォームの親（親のエンティティを指す `ref` パラメータの値）。
 */
export function frameParent(
  project: Project,
  container: string,
  params: Readonly<Record<string, unknown>>,
): string | undefined {
  const c = findContainer(project, container)?.container;
  if (!c?.entity) return undefined;
  const nest = compileEr(project).nest.get(c.entity);
  if (!nest) return undefined;
  const param = Object.entries(c.params ?? {}).find(
    ([, def]) => def.type === "ref" && def.entity === nest.parent,
  )?.[0];
  const id = param === undefined ? undefined : params[param];
  return typeof id === "string" ? id : undefined;
}

/** `state.selection.<Entity>` は選択中のレコードそのもの（無い・消えたなら null）。 */
export function selectedRecords(
  project: Project,
  rt: Pick<RuntimeState, "data" | "selection">,
): Record<string, DataRecord | null> {
  const out: Record<string, DataRecord | null> = {};
  for (const e of project.entities) {
    const id = rt.selection[e.id];
    out[e.id] =
      typeof id === "string" ? (findRecord(project, rt.data, e.id, id)?.record ?? null) : null;
  }
  return out;
}

export interface ScopeBase {
  container: string;
  params: Readonly<Record<string, unknown>>;
  frame?: Frame | undefined;
  event?: unknown;
  locals?: Readonly<Record<string, unknown>> | undefined;
}

/**
 * 式のスコープ（architecture.md 3 章の「式で参照できる名前」）。
 * data（入れ子のエンティティは全親の子を並べた一覧）・state（selection はレコード）・params・record・
 * draft・errors・event・ループ変数など。
 */
export function buildScope(project: Project, rt: RuntimeState, base: ScopeBase): Scope {
  const scope: Record<string, unknown> = {
    data: dataView(project, rt.data),
    state: { ...rt.state, selection: selectedRecords(project, rt) },
    params: base.params,
    record: frameRecord(project, rt.data, base.container, base.params),
    draft: base.frame?.draft ?? {},
    errors: base.frame?.errors ?? {},
  };
  if (base.event !== undefined) scope.event = base.event;
  return { ...scope, ...base.locals };
}

/** 画面を描くときのスコープ。 */
export function scopeFor(
  project: Project,
  rt: RuntimeState,
  frame: Frame,
  locals?: Readonly<Record<string, unknown>>,
): Scope {
  return buildScope(project, rt, {
    container: frame.container,
    params: frame.params,
    frame,
    locals,
  });
}

/** ドット区切りのパスで値を引く。 */
export function getPath(value: unknown, path: string): unknown {
  let cur = value;
  for (const key of path.split(".")) {
    if (cur === null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[key];
  }
  return cur;
}

/** ドット区切りのパスに値を入れた新しいオブジェクトを返す（途中が無ければ作る）。 */
export function setPath(
  root: Readonly<Record<string, JsonValue>>,
  path: string,
  value: JsonValue,
): Record<string, JsonValue> {
  const [head, ...rest] = path.split(".");
  if (head === undefined) return { ...root };
  if (rest.length === 0) return { ...root, [head]: value };
  const child = root[head];
  const base = child !== null && typeof child === "object" && !Array.isArray(child) ? child : {};
  return { ...root, [head]: setPath(base as Record<string, JsonValue>, rest.join("."), value) };
}

/** `Button.requires`（`selection.Device` や state のパス）を満たしているか。 */
export function requiresSatisfied(project: Project, rt: RuntimeState, requires: unknown): boolean {
  if (typeof requires !== "string" || requires === "") return true;
  const state = { ...rt.state, selection: selectedRecords(project, rt) };
  const v = getPath(state, requires);
  return v !== undefined && v !== null && v !== false && v !== "";
}
