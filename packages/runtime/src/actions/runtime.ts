import type { Action, Project } from "@ui-editor/schema";
import { createScope } from "../binding/scope.js";
import { resolveValue, type BindingError } from "../binding/template.js";

/**
 * アクションのランタイム。プレビューの状態（データ・state・表示中の画面・ダイアログ）を
 * 不変データとして持ち、アクションを実行するたびに新しい状態を返す。
 */

export interface DialogInstance {
  id: string;
  params: Record<string, unknown>;
}

export interface RuntimeState {
  /** サンプルデータ（`updateData` で更新）。 */
  data: Record<string, readonly unknown[]>;
  /** アプリ全体の状態（`setState` で更新）。 */
  state: Record<string, unknown>;
  /** 表示中の画面。 */
  screen: { id: string; params: Record<string, unknown> };
  /** 開いているダイアログ（後ろが手前）。 */
  dialogs: DialogInstance[];
}

/** アクションの実行結果の記録（プレビューのログ表示・テスト用）。 */
export interface ActionLog {
  action: Action | { type: "mount"; screen: string };
  ok: boolean;
  message: string;
}

/**
 * アクションの外側から渡す名前。イベントを発火した場所のもので、アクションを連続実行する間は変わらない
 * （ダイアログを閉じた後のアクションでも、そのダイアログの `params` を参照できる）。
 */
export interface ActionContext {
  params?: unknown;
  props?: unknown;
  event?: unknown;
  /** ループ変数など。 */
  locals?: Readonly<Record<string, unknown>>;
}

export interface RunResult {
  state: RuntimeState;
  log: ActionLog[];
}

/** プロジェクトの初期状態を作り、最初の画面の `mount` を実行する。 */
export function initRuntime(project: Project): RunResult {
  const entry = project.entry ?? project.screens[0]!.id;
  const state = freeze<RuntimeState>({
    data: structuredClone(project.sampleData),
    state: Object.fromEntries(
      Object.entries(project.state ?? {}).map(([k, d]) => [k, structuredClone(d.initial)]),
    ),
    screen: { id: entry, params: {} },
    dialogs: [],
  });
  const log: ActionLog[] = [];
  return { state: mount(project, state, log), log };
}

/**
 * アクションを順に実行する。各アクションはその時点の最新のデータ・state で評価する
 * （保存 → 閉じる → 遷移、のように前のアクションの結果が後のアクションに見える）。
 * バインディングの評価やアクションが失敗したら、そこで止める（残りは実行しない）。
 */
export function runActions(
  project: Project,
  state: RuntimeState,
  actions: readonly Action[],
  context: ActionContext = {},
): RunResult {
  const log: ActionLog[] = [];
  let current = state;
  for (const action of actions) {
    const result = runAction(project, current, action, context, log);
    if (!result) break;
    current = result;
  }
  return { state: current, log };
}

// ---- 個々のアクション ----

function runAction(
  project: Project,
  rt: RuntimeState,
  action: Action,
  context: ActionContext,
  log: ActionLog[],
): RuntimeState | undefined {
  const scope = createScope({
    data: rt.data,
    state: rt.state,
    params: context.params,
    props: context.props,
    event: context.event,
    locals: context.locals,
  });
  const resolve = (value: unknown): { value: unknown; errors: BindingError[] } =>
    resolveValue(value, scope);
  const fail = (message: string) => {
    log.push({ action, ok: false, message });
    return undefined;
  };
  const done = (next: RuntimeState, message: string) => {
    log.push({ action, ok: true, message });
    return freeze(next);
  };
  const bindingFailure = (errors: BindingError[]) =>
    fail(errors.map((e) => `{{ ${e.expression} }}: ${e.error}`).join("\n"));

  switch (action.type) {
    case "navigate": {
      const screen = project.screens.find((s) => s.id === action.to);
      if (!screen) return fail(`画面 ${action.to} がありません`);
      const params = resolve(action.params ?? {});
      if (params.errors.length > 0) return bindingFailure(params.errors);
      // 画面を移るときは開いているダイアログも閉じる
      const next = done(
        {
          ...rt,
          screen: { id: screen.id, params: params.value as Record<string, unknown> },
          dialogs: [],
        },
        `${screen.name}（${screen.id}）へ遷移`,
      );
      return mount(project, next, log);
    }
    case "openDialog": {
      const dialog = project.dialogs?.find((d) => d.id === action.dialog);
      if (!dialog) return fail(`ダイアログ ${action.dialog} がありません`);
      const params = resolve(action.params ?? {});
      if (params.errors.length > 0) return bindingFailure(params.errors);
      return done(
        {
          ...rt,
          dialogs: [
            ...rt.dialogs,
            { id: dialog.id, params: params.value as Record<string, unknown> },
          ],
        },
        `${dialog.name}（${dialog.id}）を開く`,
      );
    }
    case "closeDialog": {
      const top = rt.dialogs.at(-1);
      if (!top) return fail("開いているダイアログがありません");
      return done({ ...rt, dialogs: rt.dialogs.slice(0, -1) }, `${top.id} を閉じる`);
    }
    case "setState": {
      const value = resolve(action.value);
      if (value.errors.length > 0) return bindingFailure(value.errors);
      const updated = setPath(rt.state, action.path.split("."), value.value);
      if (!updated.ok) return fail(updated.error);
      return done(
        { ...rt, state: updated.value as Record<string, unknown> },
        `state.${action.path} = ${preview(value.value)}`,
      );
    }
    case "updateData": {
      const records = rt.data[action.collection];
      if (!records) return fail(`コレクション ${action.collection} がありません`);
      const match = resolve(action.match);
      const set = resolve(action.set);
      const errors = [...match.errors, ...set.errors];
      if (errors.length > 0) return bindingFailure(errors);
      const cond = Object.entries(match.value as Record<string, unknown>);
      let count = 0;
      const next = records.map((r) => {
        if (!isObject(r) || !cond.every(([k, v]) => r[k] === v)) return r;
        count++;
        return { ...r, ...(set.value as Record<string, unknown>) };
      });
      if (count === 0)
        return fail(
          `${action.collection} に ${preview(match.value)} に一致するレコードがありません`,
        );
      return done(
        { ...rt, data: { ...rt.data, [action.collection]: next } },
        `${action.collection} の ${count} 件を更新: ${preview(set.value)}`,
      );
    }
  }
}

/** 表示中の画面の `mount` を実行する。 */
function mount(project: Project, rt: RuntimeState, log: ActionLog[]): RuntimeState {
  const screen = project.screens.find((s) => s.id === rt.screen.id);
  const actions = screen?.events?.mount;
  if (!screen || !actions || actions.length === 0) return rt;
  log.push({
    action: { type: "mount", screen: screen.id },
    ok: true,
    message: `${screen.id} の mount`,
  });
  let current = rt;
  for (const action of actions) {
    const result = runAction(project, current, action, { params: rt.screen.params }, log);
    if (!result) break;
    current = result;
  }
  return current;
}

// ---- 補助 ----

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** ドットパスに値を入れた新しいオブジェクトを返す。途中が null / オブジェクト以外ならエラー。 */
export function setPath(
  target: unknown,
  path: readonly string[],
  value: unknown,
  parent = "state",
): { ok: true; value: unknown } | { ok: false; error: string } {
  const [head, ...rest] = path;
  if (head === undefined) return { ok: true, value };
  if (!isObject(target))
    return {
      ok: false,
      error: `${parent} が ${preview(target)} なので ${parent}.${path.join(".")} を設定できません`,
    };
  const inner = setPath(target[head], rest, value, `${parent}.${head}`);
  return inner.ok ? { ok: true, value: { ...target, [head]: inner.value } } : inner;
}

function preview(value: unknown): string {
  const text = value === undefined ? "undefined" : JSON.stringify(value);
  return text.length > 60 ? `${text.slice(0, 60)}…` : text;
}

/**
 * 状態を深く凍結する。式の中の破壊的なメソッド（`sort` / `push` など）で
 * ストアが書き換わるのを防ぐ（書き換えようとすると式のエラーになる）。
 */
export function freeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const v of Object.values(value)) freeze(v);
  }
  return value;
}
