import { serializeProject } from "@ui-editor/poc-model";
import type { EditorStore } from "./store";

/** ブラウザ内への自動保存（FR-PRJ-05）。 */

export const AUTOSAVE_KEY = "poc-editor:autosave:v1";

export interface AutosavePayload {
  /** プロジェクトの JSON（serializeProject の出力）。 */
  text: string;
  fileName: string | null;
  dirty: boolean;
  /** ISO 8601 */
  savedAt: string;
}

/** 保存されている内容を読む。無い・壊れているなら null。 */
export function readAutosave(
  storage: Pick<Storage, "getItem"> | undefined,
): AutosavePayload | null {
  try {
    const raw = storage?.getItem(AUTOSAVE_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as Partial<AutosavePayload>;
    if (typeof v.text !== "string" || typeof v.savedAt !== "string") return null;
    return {
      text: v.text,
      fileName: typeof v.fileName === "string" ? v.fileName : null,
      dirty: v.dirty === true,
      savedAt: v.savedAt,
    };
  } catch {
    return null;
  }
}

export function clearAutosave(storage: Pick<Storage, "removeItem"> | undefined): void {
  try {
    storage?.removeItem(AUTOSAVE_KEY);
  } catch {
    // 書けない環境（プライベートモードなど）では何もしない
  }
}

/**
 * プロジェクト・ファイル名・未保存フラグが変わるたびに、少し待ってから保存する。
 * 止める関数を返す。
 */
export function startAutosave(
  store: EditorStore,
  storage: Pick<Storage, "setItem"> | undefined,
  delayMs = 500,
  now: () => Date = () => new Date(),
): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const save = () => {
    timer = undefined;
    const { project, file, dirty } = store.getState();
    const payload: AutosavePayload = {
      text: serializeProject(project),
      fileName: file?.name ?? null,
      dirty,
      savedAt: now().toISOString(),
    };
    try {
      storage?.setItem(AUTOSAVE_KEY, JSON.stringify(payload));
    } catch {
      // 容量超過などは無視する（自動保存は補助）
    }
  };
  const unsubscribe = store.subscribe((state, prev) => {
    if (state.project === prev.project && state.file === prev.file && state.dirty === prev.dirty)
      return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(save, delayMs);
  });
  return () => {
    unsubscribe();
    if (timer) {
      clearTimeout(timer);
      save();
    }
  };
}
