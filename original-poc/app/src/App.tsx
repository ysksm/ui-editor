import { useEffect } from "react";
import { ConfirmDialog } from "./components/ConfirmDialog";
import { Header } from "./components/Header";
import { IssuesPanel } from "./components/IssuesPanel";
import { NoticeBar } from "./components/NoticeBar";
import { ViewNav } from "./components/ViewNav";
import { fileActions } from "./state/file-actions";
import { useEditor, useEditorStore, type ViewId } from "./state/store";
import { DataView } from "./views/DataView";
import { ErView } from "./views/ErView";
import { FlowView } from "./views/FlowView";
import { ScreenView } from "./views/ScreenView";

const VIEW_COMPONENTS: Record<ViewId, () => React.JSX.Element> = {
  er: ErView,
  data: DataView,
  flow: FlowView,
  screen: ScreenView,
};

export function App() {
  const view = useEditor((s) => s.view);
  useShortcuts();
  const View = VIEW_COMPONENTS[view];
  return (
    <div className="app">
      <Header />
      <NoticeBar />
      <div className="body">
        <ViewNav />
        <main className="main" key={view}>
          <View />
        </main>
      </div>
      <IssuesPanel />
      <ConfirmDialog />
    </div>
  );
}

/** Cmd/Ctrl + Z（元に戻す）・Shift + Cmd/Ctrl + Z / Ctrl + Y（やり直す）・Cmd/Ctrl + S（保存）。 */
function useShortcuts() {
  const store = useEditorStore();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return;
      const key = e.key.toLowerCase();
      if (key === "s") {
        e.preventDefault();
        void fileActions(store).save(e.shiftKey);
        return;
      }
      const t = e.target as HTMLElement | null;
      // 入力欄の中では、ブラウザの文字の取り消しに任せる
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      if (key === "z") {
        e.preventDefault();
        if (e.shiftKey) store.getState().redo();
        else store.getState().undo();
      } else if (key === "y") {
        e.preventDefault();
        store.getState().redo();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [store]);
}
