import { checkProject, type Issue, type Project } from "@ui-editor/poc-model";
import { start, type RuntimeState } from "@ui-editor/poc-runtime";
import { createContext, useContext } from "react";
import { createStore, useStore, type StoreApi } from "zustand";
import type { FileHandle } from "./files";
import { applyEdit, EMPTY_HISTORY, redo, undo, type History, type Recipe } from "./history";

export type ViewId = "er" | "data" | "flow" | "screen";

export const VIEWS: { id: ViewId; label: string }[] = [
  { id: "er", label: "ER" },
  { id: "data", label: "データ" },
  { id: "flow", label: "フロー" },
  { id: "screen", label: "画面" },
];

/** ビューで選んでいるもの（ファイルには書かない）。 */
export type Selection =
  | { kind: "entity"; id: string; field?: string | undefined }
  | { kind: "data"; entity: string; id?: string | undefined }
  | { kind: "container"; id: string }
  /** フロー図の遷移（key は extractTransitions が導くもの。編集のたびに選び直す）。 */
  | { kind: "transition"; key: string }
  /** 画面ビューで選んだ部品。 */
  | { kind: "node"; container: string; node: string }
  | null;

export interface FileInfo {
  name: string;
  /** 上書き保存先（File System Access API で開いた・保存したとき）。 */
  handle?: FileHandle | undefined;
}

export interface Notice {
  kind: "info" | "error";
  text: string;
}

export interface ConfirmRequest {
  text: string;
  okLabel: string;
  onOk: () => void;
}

export interface EditorState {
  project: Project;
  /** 参照・整合性の検証の結果（編集のたびに作り直す）。 */
  issues: Issue[];
  history: History;
  file: FileInfo | null;
  /** 保存してから変更があるか。 */
  dirty: boolean;
  view: ViewId;
  selection: Selection;
  notice: Notice | null;
  confirm: ConfirmRequest | null;
  issuesOpen: boolean;
  /** プレビューの区画を開いているか。 */
  previewOpen: boolean;
  /** プレビューの実行状態（開いていない・まだ始めていないなら null）。 */
  runtime: RuntimeState | null;

  /** 編集操作を適用する（Undo できる）。操作が Error を投げたら何も変えずに通知に出し、false を返す。 */
  edit: (label: string, recipe: Recipe) => boolean;
  undo: () => void;
  redo: () => void;
  /** プロジェクトを入れ替える（新規・開く）。履歴は消す。 */
  replaceProject: (project: Project, file: FileInfo | null, options?: { dirty?: boolean }) => void;
  markSaved: (file: FileInfo) => void;
  setView: (view: ViewId) => void;
  select: (selection: Selection) => void;
  setNotice: (notice: Notice | null) => void;
  /** 未保存の変更があれば確かめてから実行する。 */
  confirmDiscard: (text: string, okLabel: string, onOk: () => void) => void;
  /** 確かめてから実行する（削除など）。 */
  requestConfirm: (text: string, okLabel: string, onOk: () => void) => void;
  closeConfirm: () => void;
  toggleIssues: (open?: boolean) => void;
  /** プレビューを開閉する。開くときにまだ始めていなければ最初の画面から始める。 */
  togglePreview: (open?: boolean) => void;
  /** プレビューの状態を置き換える（イベントの実行結果）。 */
  setRuntime: (runtime: RuntimeState) => void;
  /** 最初の画面からやり直す。 */
  restartPreview: () => void;
}

export type EditorStore = StoreApi<EditorState>;

export interface InitialState {
  project: Project;
  file?: FileInfo | null;
  dirty?: boolean;
  view?: ViewId;
  notice?: Notice | null;
}

export function createEditorStore(initial: InitialState): EditorStore {
  return createStore<EditorState>()((set, get) => ({
    project: initial.project,
    issues: checkProject(initial.project),
    history: EMPTY_HISTORY,
    file: initial.file ?? null,
    dirty: initial.dirty ?? false,
    view: initial.view ?? "er",
    selection: null,
    notice: initial.notice ?? null,
    confirm: null,
    issuesOpen: false,
    previewOpen: false,
    runtime: null,

    edit: (label, recipe) => {
      const { project, history } = get();
      let r: ReturnType<typeof applyEdit>;
      try {
        r = applyEdit(project, history, label, recipe);
      } catch (e) {
        set({
          notice: { kind: "error", text: `${label}できませんでした: ${(e as Error).message}` },
        });
        return false;
      }
      if (!r) return true;
      set({ project: r.project, history: r.history, issues: checkProject(r.project), dirty: true });
      return true;
    },
    undo: () => {
      const { project, history } = get();
      const r = undo(project, history);
      if (!r) return;
      set({ project: r.project, history: r.history, issues: checkProject(r.project), dirty: true });
    },
    redo: () => {
      const { project, history } = get();
      const r = redo(project, history);
      if (!r) return;
      set({ project: r.project, history: r.history, issues: checkProject(r.project), dirty: true });
    },
    replaceProject: (project, file, options = {}) =>
      set({
        project,
        issues: checkProject(project),
        history: EMPTY_HISTORY,
        file,
        dirty: options.dirty ?? false,
        selection: null,
        confirm: null,
        runtime: get().previewOpen ? start(project) : null,
      }),
    markSaved: (file) => set({ file, dirty: false }),
    setView: (view) => set({ view }),
    select: (selection) => set({ selection }),
    setNotice: (notice) => set({ notice }),
    confirmDiscard: (text, okLabel, onOk) => {
      if (!get().dirty) onOk();
      else set({ confirm: { text, okLabel, onOk } });
    },
    requestConfirm: (text, okLabel, onOk) => set({ confirm: { text, okLabel, onOk } }),
    closeConfirm: () => set({ confirm: null }),
    toggleIssues: (open) => set((s) => ({ issuesOpen: open ?? !s.issuesOpen })),
    togglePreview: (open) => {
      const next = open ?? !get().previewOpen;
      set({
        previewOpen: next,
        runtime: next ? (get().runtime ?? start(get().project)) : get().runtime,
      });
    },
    setRuntime: (runtime) => set({ runtime }),
    restartPreview: () => set({ runtime: start(get().project) }),
  }));
}

export const EditorContext = createContext<EditorStore | null>(null);

export function useEditorStore(): EditorStore {
  const store = useContext(EditorContext);
  if (!store) throw new Error("EditorContext がありません");
  return store;
}

export function useEditor<T>(selector: (state: EditorState) => T): T {
  return useStore(useEditorStore(), selector);
}
