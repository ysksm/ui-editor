import {
  compileEr,
  createRecord,
  deleteRecords,
  describeRecord,
  emptyRecord,
  updateRecords,
  type DataChange,
  type DataResult,
} from "@ui-editor/poc-datastore";
import {
  findContainer,
  findNode,
  type Action,
  type DataRecord,
  type JsonValue,
  type Project,
} from "@ui-editor/poc-model";
import {
  buildScope,
  describeErrors,
  evaluate,
  frameParent,
  frameRecord,
  resolve,
  setPath,
  type Scope,
} from "./scope.js";
import type { CallContext, Frame, LogEntry, RuntimeState } from "./types.js";

/**
 * プレビューの実行エンジン（architecture.md 6 章）。すべて純粋関数で、新しい RuntimeState を返す。
 */

// ---- 始める・フレーム ----

/** 最初の画面（entry、無ければ screens[0]）を開き、その mount を実行する。 */
export function start(project: Project): RuntimeState {
  let rt: RuntimeState = {
    data: project.data,
    state: structuredClone(project.state),
    selection: {},
    history: [],
    dialogs: [],
    trail: [],
    log: [],
    seq: 1,
  };
  const entry = project.entry ?? project.screens[0]?.id;
  if (!entry || !findContainer(project, entry)) {
    return addLog(rt, "error", "最初の画面がありません（画面を作ってください）");
  }
  const frame = newFrame(project, rt, entry, {});
  rt = { ...frame.rt, history: [frame.frame] };
  rt = addLog(rt, "info", `${nameOf(project, entry)}を開いた`, entry);
  return runMount(project, rt, frame.frame);
}

/** 今いちばん手前のフレーム（ダイアログが開いていればダイアログ）。 */
export function currentFrame(rt: RuntimeState): Frame | undefined {
  return rt.dialogs.at(-1) ?? rt.history.at(-1);
}

export function currentScreen(rt: RuntimeState): Frame | undefined {
  return rt.history.at(-1);
}

export function findFrame(rt: RuntimeState, id: number): Frame | undefined {
  return rt.dialogs.find((f) => f.id === id) ?? rt.history.find((f) => f.id === id);
}

/** プレビューのデータを元のサンプルデータに戻す（選択も外す）。画面はそのまま。 */
export function resetData(project: Project, rt: RuntimeState): RuntimeState {
  const reinit = (f: Frame) => ({
    ...f,
    ...initDraft(project, project.data, f.container, f.params),
  });
  return addLog(
    {
      ...rt,
      data: project.data,
      state: structuredClone(project.state),
      selection: {},
      history: rt.history.map(reinit),
      dialogs: rt.dialogs.map(reinit),
    },
    "info",
    "データをリセットした",
  );
}

function newFrame(
  project: Project,
  rt: RuntimeState,
  container: string,
  params: Readonly<Record<string, unknown>>,
): { rt: RuntimeState; frame: Frame } {
  const ref = findContainer(project, container)!;
  const frame: Frame = {
    id: rt.seq,
    container,
    kind: ref.kind,
    params,
    ...initDraft(project, rt.data, container, params),
  };
  return { rt: { ...rt, seq: rt.seq + 1 }, frame };
}

/** フォーム（kind: form と entity）を開いたときの下書き。レコードがあれば複製（編集）、無ければ既定値（作成）。 */
function initDraft(
  project: Project,
  data: RuntimeState["data"],
  container: string,
  params: Readonly<Record<string, unknown>>,
): Pick<Frame, "draft" | "errors"> {
  const c = findContainer(project, container)?.container;
  const entity =
    c?.kind === "form" && c.entity ? project.entities.find((e) => e.id === c.entity) : undefined;
  if (!entity) return { draft: undefined, errors: undefined };
  const record = frameRecord(project, data, container, params);
  const draft: DataRecord = {};
  const source = record ?? emptyRecord(entity);
  for (const f of entity.fields) {
    if (f.type === "children") continue;
    if (source[f.id] !== undefined) draft[f.id] = source[f.id]!;
  }
  return { draft, errors: {} };
}

function runMount(project: Project, rt: RuntimeState, frame: Frame): RuntimeState {
  const c = findContainer(project, frame.container)?.container;
  const mount = c && "events" in c ? c.events?.mount : undefined;
  if (!mount?.length) return rt;
  return runActions(project, rt, mount, {
    frameId: frame.id,
    container: frame.container,
    params: frame.params,
    keyPrefix: `${frame.container}::mount:`,
  });
}

// ---- イベント ----

export interface EventTarget {
  frameId: number;
  node: string;
  event: string;
  /** イベントの値（event.row / event.value など）。 */
  payload?: unknown;
  /** ループ変数など（repeat の中のノード）。 */
  locals?: Readonly<Record<string, unknown>> | undefined;
}

/**
 * ノードのイベントを発火する。表の rowSelect は、表の entity があれば先に選択状態を変える。
 * そのあと、ノードの events[event] のアクションを順に実行する。
 */
export function fireEvent(project: Project, rt: RuntimeState, target: EventTarget): RuntimeState {
  const frame = findFrame(rt, target.frameId);
  if (!frame) return addLog(rt, "error", "イベントの画面が閉じられています");
  const node = findNode(findContainer(project, frame.container)?.container.root, target.node);
  if (!node) return addLog(rt, "error", `部品 "${target.node}" がありません`, frame.container);
  let next = rt;
  if (
    node.type === "Table" &&
    target.event === "rowSelect" &&
    typeof node.props?.entity === "string"
  ) {
    const entity = project.entities.find((e) => e.id === node.props!.entity);
    const row = (target.payload as { row?: DataRecord } | undefined)?.row;
    const id = entity && row ? row[entity.primaryKey] : undefined;
    if (entity && typeof id === "string") {
      next = { ...next, selection: { ...next.selection, [entity.id]: id } };
      next = addLog(
        next,
        "info",
        `${entity.name}「${describeRecord(entity, row!)}」を選んだ`,
        frame.container,
      );
    }
  }
  const actions = node.events?.[target.event] ?? [];
  return runActions(project, next, actions, {
    frameId: frame.id,
    container: frame.container,
    params: frame.params,
    event: target.payload,
    locals: target.locals,
    keyPrefix: `${frame.container}:${node.id}:${target.event}:`,
  });
}

/** 戻る: ダイアログが開いていれば閉じる（結果 cancel）、無ければ前の画面へ。 */
export function back(project: Project, rt: RuntimeState): RuntimeState {
  if (rt.dialogs.length > 0) return closeTop(project, rt, "cancel").rt;
  if (rt.history.length <= 1) return addLog(rt, "info", "これ以上戻れません");
  const history = rt.history.slice(0, -1);
  return addLog(
    { ...rt, history },
    "info",
    `${nameOf(project, history.at(-1)!.container)}に戻った`,
  );
}

// ---- アクション ----

type Step = { ok: true; rt: RuntimeState } | { ok: false; rt: RuntimeState };

/**
 * アクションを順に実行する。各アクションは直前のアクションの結果（データ・state）を見て評価する。
 * when が偽なら飛ばし、失敗したら（検証エラー・restrict など）そこで止める。
 */
export function runActions(
  project: Project,
  rt: RuntimeState,
  actions: readonly Action[],
  ctx: CallContext,
): RuntimeState {
  let current = rt;
  for (const [i, action] of actions.entries()) {
    const scope = scopeOf(project, current, ctx);
    if (action.when !== undefined) {
      const w = evaluate(action.when, scope);
      if (w.errors.length > 0) return fail(current, ctx, describeErrors(w.errors)).rt;
      if (!w.value) {
        current = addLog(
          current,
          "info",
          `${action.type} は条件（when）を満たさないので飛ばした`,
          ctx.container,
        );
        continue;
      }
    }
    const step = runAction(project, current, action, ctx, `${ctx.keyPrefix}${i}`, scope);
    current = step.rt;
    if (!step.ok) break;
  }
  return current;
}

function scopeOf(project: Project, rt: RuntimeState, ctx: CallContext): Scope {
  return buildScope(project, rt, {
    container: ctx.container,
    params: ctx.params,
    frame: findFrame(rt, ctx.frameId),
    event: ctx.event,
    locals: ctx.locals,
  });
}

function runAction(
  project: Project,
  rt: RuntimeState,
  action: Action,
  ctx: CallContext,
  key: string,
  scope: Scope,
): Step {
  const value = (v: unknown): { ok: true; value: unknown } | { ok: false; message: string } => {
    const r = resolve(v, scope);
    return r.errors.length > 0
      ? { ok: false, message: describeErrors(r.errors) }
      : { ok: true, value: r.value };
  };
  switch (action.type) {
    case "navigate": {
      const target = findContainer(project, action.to);
      if (target?.kind !== "screen") return fail(rt, ctx, `画面 "${action.to}" がありません`);
      const params = value(action.params ?? {});
      if (!params.ok) return fail(rt, ctx, params.message);
      const created = newFrame(project, rt, action.to, params.value as Record<string, unknown>);
      // 履歴に同じ画面があればそこまで戻す（「一覧に戻る」で履歴が伸び続けないように）
      const at = created.rt.history.findIndex((f) => f.container === action.to);
      const history = at >= 0 ? created.rt.history.slice(0, at) : created.rt.history;
      let next: RuntimeState = {
        ...created.rt,
        history: [...history, created.frame],
        dialogs: [],
        trail: [...created.rt.trail, { key, from: ctx.container, to: action.to }],
      };
      next = addLog(next, "info", `${nameOf(project, action.to)}へ遷移`, ctx.container);
      return { ok: true, rt: runMount(project, next, created.frame) };
    }
    case "openDialog": {
      const target = findContainer(project, action.dialog);
      if (target?.kind !== "dialog")
        return fail(rt, ctx, `ダイアログ "${action.dialog}" がありません`);
      const params = value(action.params ?? {});
      if (!params.ok) return fail(rt, ctx, params.message);
      const created = newFrame(project, rt, action.dialog, params.value as Record<string, unknown>);
      const frame: Frame = action.onClose
        ? {
            ...created.frame,
            onClose: { actions: action.onClose, caller: { ...ctx, keyPrefix: `${key}/onClose/` } },
          }
        : created.frame;
      const next: RuntimeState = {
        ...created.rt,
        dialogs: [...created.rt.dialogs, frame],
        trail: [...created.rt.trail, { key, from: ctx.container, to: action.dialog }],
      };
      return {
        ok: true,
        rt: addLog(next, "info", `${nameOf(project, action.dialog)}を開いた`, ctx.container),
      };
    }
    case "closeDialog": {
      if (rt.dialogs.length === 0)
        return { ok: true, rt: addLog(rt, "info", "閉じるダイアログがありません", ctx.container) };
      return closeTop(project, rt, action.result ?? "ok");
    }
    case "back":
      return { ok: true, rt: back(project, rt) };
    case "setState": {
      const v = value(action.value);
      if (!v.ok) return fail(rt, ctx, v.message);
      const next = { ...rt, state: setPath(rt.state, action.path, v.value as JsonValue) };
      return {
        ok: true,
        rt: addLog(next, "info", `state.${action.path} = ${short(v.value)}`, ctx.container),
      };
    }
    case "select": {
      const v = action.id === null ? { ok: true as const, value: null } : value(action.id);
      if (!v.ok) return fail(rt, ctx, v.message);
      const id =
        v.value === null || v.value === undefined || v.value === "" ? null : String(v.value);
      const next = { ...rt, selection: { ...rt.selection, [action.entity]: id } };
      return {
        ok: true,
        rt: addLog(next, "info", `${action.entity} の選択: ${id ?? "なし"}`, ctx.container),
      };
    }
    case "createRecord": {
      const values = value(action.values);
      if (!values.ok) return fail(rt, ctx, values.message);
      const parent =
        action.parent === undefined
          ? { ok: true as const, value: undefined }
          : value(action.parent);
      if (!parent.ok) return fail(rt, ctx, parent.message);
      const r = createRecord(project, rt.data, action.entity, values.value as DataRecord, {
        parent:
          parent.value === undefined || parent.value === null ? undefined : String(parent.value),
      });
      return applyData(project, rt, ctx, r, "作成");
    }
    case "updateRecord": {
      const match = value(action.match);
      const set = value(action.set);
      if (!match.ok) return fail(rt, ctx, match.message);
      if (!set.ok) return fail(rt, ctx, set.message);
      const r = updateRecords(
        project,
        rt.data,
        action.entity,
        match.value as Record<string, JsonValue>,
        set.value as Record<string, JsonValue>,
      );
      return applyData(project, rt, ctx, r, "更新");
    }
    case "deleteRecord": {
      const match = value(action.match);
      if (!match.ok) return fail(rt, ctx, match.message);
      const r = deleteRecords(
        project,
        rt.data,
        action.entity,
        match.value as Record<string, JsonValue>,
      );
      return applyData(project, rt, ctx, r, "削除");
    }
    case "setDraft": {
      const frame = findFrame(rt, ctx.frameId);
      if (!frame?.draft)
        return fail(rt, ctx, "フォーム（kind: form と entity）ではないので下書きがありません");
      const v = value(action.value);
      if (!v.ok) return fail(rt, ctx, v.message);
      const errors = { ...frame.errors };
      delete errors[action.field];
      const next = replaceFrame(rt, {
        ...frame,
        draft: { ...frame.draft, [action.field]: v.value as JsonValue },
        errors,
      });
      return { ok: true, rt: next };
    }
    case "saveDraft":
      return saveDraft(project, rt, ctx);
  }
}

function applyData(
  project: Project,
  rt: RuntimeState,
  ctx: CallContext,
  result: DataResult,
  verb: string,
): Step {
  if (!result.ok) {
    const fields = Object.entries(result.fieldErrors ?? {})
      .map(([k, v]) => `${k}: ${v}`)
      .join("、");
    return fail(
      rt,
      ctx,
      `${verb}できませんでした: ${result.error}${fields ? `（${fields}）` : ""}`,
    );
  }
  const next = { ...rt, data: result.data };
  return {
    ok: true,
    rt: addLog(
      next,
      "info",
      describeChanges(project, result.changes, verb),
      ctx.container,
      result.changes,
    ),
  };
}

/** フォームの下書きを検証して保存する。レコードがあれば更新、無ければ作成（入れ子なら親のパラメータを使う）。 */
function saveDraft(project: Project, rt: RuntimeState, ctx: CallContext): Step {
  const frame = findFrame(rt, ctx.frameId);
  const c = frame ? findContainer(project, frame.container)?.container : undefined;
  const entity = c?.entity ? project.entities.find((e) => e.id === c.entity) : undefined;
  if (!frame?.draft || !entity)
    return fail(rt, ctx, "フォーム（kind: form と entity）ではないので保存できません");
  const record = frameRecord(project, rt.data, frame.container, frame.params);
  let result: DataResult;
  if (record) {
    const set: Record<string, JsonValue> = {};
    for (const f of entity.fields) {
      if (f.type === "children" || f.id === entity.primaryKey) continue;
      if (frame.draft[f.id] !== undefined) set[f.id] = frame.draft[f.id]!;
    }
    result = updateRecords(
      project,
      rt.data,
      entity.id,
      { [entity.primaryKey]: record[entity.primaryKey]! },
      set,
    );
  } else {
    const values: DataRecord = {};
    for (const [k, v] of Object.entries(frame.draft))
      if (k !== entity.primaryKey || v !== "") values[k] = v;
    const parent = compileEr(project).nest.has(entity.id)
      ? frameParent(project, frame.container, frame.params)
      : undefined;
    result = createRecord(project, rt.data, entity.id, values, { parent });
  }
  if (!result.ok) {
    const errors = result.fieldErrors ?? { "": result.error };
    const next = replaceFrame(rt, { ...frame, errors });
    return fail(next, ctx, `保存できませんでした: ${Object.values(errors).join("、")}`);
  }
  const next = replaceFrame({ ...rt, data: result.data }, { ...frame, errors: {} });
  return {
    ok: true,
    rt: addLog(
      next,
      "info",
      describeChanges(project, result.changes, "保存"),
      ctx.container,
      result.changes,
    ),
  };
}

/** 最前面のダイアログを閉じ、開いた openDialog の onClose[result] を呼び出し元で実行する。 */
function closeTop(project: Project, rt: RuntimeState, result: string): Step {
  const top = rt.dialogs.at(-1);
  if (!top) return { ok: true, rt };
  let next = addLog(
    { ...rt, dialogs: rt.dialogs.slice(0, -1) },
    "info",
    `${nameOf(project, top.container)}を閉じた（${result}）`,
    top.container,
  );
  const after = top.onClose?.actions[result];
  if (after?.length && top.onClose) {
    const caller = top.onClose.caller;
    next = runActions(project, next, after, {
      ...caller,
      keyPrefix: `${caller.keyPrefix}${result}/`,
    });
  }
  return { ok: true, rt: next };
}

// ---- 補助 ----

function replaceFrame(rt: RuntimeState, frame: Frame): RuntimeState {
  return {
    ...rt,
    history: rt.history.map((f) => (f.id === frame.id ? frame : f)),
    dialogs: rt.dialogs.map((f) => (f.id === frame.id ? frame : f)),
  };
}

function fail(rt: RuntimeState, ctx: CallContext, message: string): Step {
  return { ok: false, rt: addLog(rt, "error", message, ctx.container) };
}

const LOG_LIMIT = 300;

function addLog(
  rt: RuntimeState,
  level: LogEntry["level"],
  message: string,
  container?: string,
  changes?: DataChange[],
): RuntimeState {
  const entry: LogEntry = { seq: rt.seq, level, message, container, changes };
  return { ...rt, seq: rt.seq + 1, log: [...rt.log, entry].slice(-LOG_LIMIT) };
}

function nameOf(project: Project, id: string): string {
  return findContainer(project, id)?.container.name ?? id;
}

function short(v: unknown): string {
  const s = JSON.stringify(v) ?? String(v);
  return s.length > 60 ? `${s.slice(0, 57)}...` : s;
}

/** データの変更の説明（「Device dev-001 を削除（Alarm 2 件も削除）」）。 */
function describeChanges(project: Project, changes: readonly DataChange[], verb: string): string {
  if (changes.length === 0) return `${verb}: 対象がありませんでした`;
  const names = new Map(project.entities.map((e) => [e.id, e.name]));
  const main = changes.filter((c) => c.reason === "match");
  const rest = new Map<string, number>();
  for (const c of changes) {
    if (c.reason === "match") continue;
    const k = `${names.get(c.entity) ?? c.entity}${c.reason === "setNull" ? "（参照を null に）" : ""}`;
    rest.set(k, (rest.get(k) ?? 0) + 1);
  }
  const head = main.map((c) => `${names.get(c.entity) ?? c.entity} ${c.id}`).join("、");
  const tail = [...rest].map(([k, n]) => `${k} ${n} 件`).join("、");
  return `${head} を${verb}${tail ? `（${tail}も）` : ""}`;
}
