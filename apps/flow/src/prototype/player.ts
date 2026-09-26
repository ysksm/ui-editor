import type { Action, Events, Node, Project } from "@ui-editor/schema";
import { walkTree } from "../graph/extract";

/**
 * プロトタイプモードの再生。
 * 画面遷移に関わるアクション（navigate / openDialog / closeDialog）だけを実行し、
 * setState / updateData は記録するだけで実行しない。バインディングも評価しない。
 */

export interface PlayerState {
  screenId: string;
  /** 開いているダイアログ。P1 の生成コードと同じく同時に 1 つだけ */
  dialog: string | null;
}

export interface LogEntry {
  /** 実行した・読み飛ばしたアクションの説明 */
  text: string;
  skipped: boolean;
}

/** クリックすると遷移に関わるアクションが動くパーツ。 */
export interface Hotspot {
  nodeId: string;
  event: string;
  actions: Action[];
}

const NAVIGATION = new Set<Action["type"]>(["navigate", "openDialog", "closeDialog"]);

/** 画面自体の `mount` からの遷移（リダイレクト）をたどる上限。 */
const MAX_REDIRECTS = 10;

export function initialState(project: Project, startId?: string): PlayerState {
  if (startId && project.dialogs?.some((d) => d.id === startId)) {
    // ダイアログから始めるときは、開始画面の上に開く
    return { screenId: entryOf(project), dialog: startId };
  }
  const screenId =
    startId && project.screens.some((s) => s.id === startId) ? startId : entryOf(project);
  return { screenId, dialog: null };
}

function entryOf(project: Project): string {
  return project.entry ?? project.screens[0]!.id;
}

/** いま操作できる画面・ダイアログ（ダイアログが開いていれば一番手前）。 */
export function activeOwner(state: PlayerState): { kind: "screen" | "dialog"; id: string } {
  return state.dialog
    ? { kind: "dialog", id: state.dialog }
    : { kind: "screen", id: state.screenId };
}

/**
 * 画面・ダイアログの中のホットスポット。コンポーネント内のイベントはインスタンスのものとして扱う。
 * 1 つのパーツに複数のイベントがあるときは、遷移に関わるアクションを持つ最初のイベントを使う。
 */
export function hotspotsOf(project: Project, root: Node): Map<string, Hotspot> {
  const components = new Map((project.components ?? []).map((c) => [c.id, c]));
  const out = new Map<string, Hotspot>();
  const pick = (events: Events | undefined) =>
    Object.entries(events ?? {}).find(([, actions]) => actions.some((a) => NAVIGATION.has(a.type)));

  const fromComponent = (type: string, visiting: Set<string>): [string, Action[]] | undefined => {
    const c = components.get(type);
    if (!c || visiting.has(type)) return undefined;
    visiting.add(type);
    let found: [string, Action[]] | undefined;
    walkTree(c.root, (n) => {
      found ??= pick(n.events) ?? fromComponent(n.type, visiting);
    });
    return found;
  };

  walkTree(root, (node) => {
    const found = pick(node.events) ?? fromComponent(node.type, new Set());
    if (found) out.set(node.id, { nodeId: node.id, event: found[0], actions: found[1] });
  });
  return out;
}

/** アクションを順に実行する。 */
export function runActions(
  project: Project,
  state: PlayerState,
  actions: Action[],
): { state: PlayerState; log: LogEntry[] } {
  return run(project, state, actions, 0);
}

function run(
  project: Project,
  state: PlayerState,
  actions: Action[],
  depth: number,
): { state: PlayerState; log: LogEntry[] } {
  let next: PlayerState = { ...state };
  const log: LogEntry[] = [];
  for (const action of actions) {
    switch (action.type) {
      case "navigate": {
        // ダイアログは閉じない（P1 の生成コードと同じ。閉じるなら先に closeDialog を置く）
        next = { ...next, screenId: action.to };
        log.push({ text: `navigate → ${action.to}${paramsText(action.params)}`, skipped: false });
        const mount = runMount(project, next, depth + 1);
        next = mount.state;
        log.push(...mount.log);
        break;
      }
      case "openDialog":
        next = { ...next, dialog: action.dialog }; // 開いているものは置き換える
        log.push({
          text: `openDialog → ${action.dialog}${paramsText(action.params)}`,
          skipped: false,
        });
        break;
      case "closeDialog":
        next = { ...next, dialog: null };
        log.push({ text: "closeDialog", skipped: false });
        break;
      case "setState":
        log.push({ text: `setState ${action.path}（実行しない）`, skipped: true });
        break;
      case "updateData":
        log.push({ text: `updateData ${action.collection}（実行しない）`, skipped: true });
        break;
    }
  }
  return { state: next, log };
}

/** 画面の `mount` を実行する（遷移に関わるものだけ動く）。 */
function runMount(
  project: Project,
  state: PlayerState,
  depth: number,
): { state: PlayerState; log: LogEntry[] } {
  const screen = project.screens.find((s) => s.id === state.screenId);
  const actions = screen?.events?.mount;
  if (!actions) return { state, log: [] };
  if (depth > MAX_REDIRECTS) {
    return { state, log: [{ text: "mount の遷移が多すぎるので止めました", skipped: true }] };
  }
  const log: LogEntry[] = [{ text: `${state.screenId} の mount`, skipped: false }];
  let next = state;
  for (const action of actions) {
    const r = run(project, next, [action], depth);
    next = r.state;
    log.push(...r.log);
    if (action.type === "navigate") break; // 移った先の mount は runActions の中で実行済み
  }
  return { state: next, log };
}

export function enterScreen(
  project: Project,
  state: PlayerState,
): { state: PlayerState; log: LogEntry[] } {
  return runMount(project, state, 0);
}

function paramsText(params: Record<string, unknown> | undefined): string {
  if (!params || Object.keys(params).length === 0) return "";
  return `（${Object.entries(params)
    .map(([k, v]) => `${k}: ${typeof v === "string" ? v : JSON.stringify(v)}`)
    .join(", ")}）`;
}
