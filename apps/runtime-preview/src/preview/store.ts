import {
  initRuntime,
  runActions,
  type ActionContext,
  type ActionLog,
  type RuntimeState,
} from "@ui-editor/runtime";
import type { Action, Project } from "@ui-editor/schema";

/** プレビューの状態: ランタイムの状態と、発火したイベントごとの実行ログ。 */
export interface PreviewState {
  rt: RuntimeState;
  history: { label: string; log: ActionLog[] }[];
}

export type PreviewAction =
  | { type: "fire"; label: string; actions: readonly Action[]; context: ActionContext }
  | { type: "reset" };

export function initPreview(project: Project): PreviewState {
  const { state, log } = initRuntime(project);
  return { rt: state, history: log.length > 0 ? [{ label: "開始", log }] : [] };
}

/** アクションの実行は純粋な関数（runActions）なので、reducer にそのまま載せられる。 */
export function previewReducer(project: Project) {
  return (s: PreviewState, a: PreviewAction): PreviewState => {
    if (a.type === "reset") return initPreview(project);
    const { state, log } = runActions(project, s.rt, a.actions, a.context);
    // 直近 50 件だけ残す
    return { rt: state, history: [{ label: a.label, log }, ...s.history].slice(0, 50) };
  };
}

/** 画面の path の `:xxx` を params で埋める（URL 表示用）。 */
export function screenUrl(path: string, params: Record<string, unknown>): string {
  return path.replace(/:([A-Za-z_][A-Za-z0-9_]*)/g, (_, k: string) =>
    params[k] === undefined ? `:${k}` : encodeURIComponent(String(params[k])),
  );
}
