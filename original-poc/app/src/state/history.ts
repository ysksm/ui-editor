import type { Project } from "@ui-editor/poc-model";
import { applyPatches, enablePatches, produceWithPatches, type Patch } from "immer";

enablePatches();

/** 編集操作（poc-model の `(draft: Project) => void`）。 */
export type Recipe = (draft: Project) => void;

export interface HistoryEntry {
  /** Undo / Redo のボタンに出す説明。例: 「エンティティを追加」 */
  label: string;
  patches: Patch[];
  inverse: Patch[];
}

export interface History {
  past: HistoryEntry[];
  future: HistoryEntry[];
}

/** 履歴に残す件数。 */
export const HISTORY_LIMIT = 200;

export const EMPTY_HISTORY: History = { past: [], future: [] };

/** 編集を適用し、逆パッチを履歴に積む。何も変わらなければ undefined。 */
export function applyEdit(
  project: Project,
  history: History,
  label: string,
  recipe: Recipe,
): { project: Project; history: History } | undefined {
  const [next, patches, inverse] = produceWithPatches(project, recipe);
  if (patches.length === 0) return undefined;
  const past = [...history.past, { label, patches, inverse }].slice(-HISTORY_LIMIT);
  return { project: next, history: { past, future: [] } };
}

export function undo(
  project: Project,
  history: History,
): { project: Project; history: History; entry: HistoryEntry } | undefined {
  const entry = history.past.at(-1);
  if (!entry) return undefined;
  return {
    project: applyPatches(project, entry.inverse),
    history: { past: history.past.slice(0, -1), future: [entry, ...history.future] },
    entry,
  };
}

export function redo(
  project: Project,
  history: History,
): { project: Project; history: History; entry: HistoryEntry } | undefined {
  const entry = history.future[0];
  if (!entry) return undefined;
  return {
    project: applyPatches(project, entry.patches),
    history: { past: [...history.past, entry], future: history.future.slice(1) },
    entry,
  };
}
