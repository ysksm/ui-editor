import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { EXAMPLE_FILE_NAME, loadExample } from "./example";
import { readAutosave, startAutosave } from "./state/autosave";
import { parseProjectFile } from "./state/files";
import { createEditorStore, EditorContext, type InitialState } from "./state/store";
import "./styles.css";

function localStorageOrUndefined(): Storage | undefined {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

/** 自動保存があれば復元し、無ければ題材を開く。 */
function initialState(storage: Storage | undefined): InitialState {
  const saved = readAutosave(storage);
  if (saved) {
    try {
      return {
        project: parseProjectFile(saved.text),
        file: saved.fileName ? { name: saved.fileName } : null,
        dirty: saved.dirty,
        notice: {
          kind: "info",
          text: `前回の作業（${new Date(saved.savedAt).toLocaleString("ja-JP")}）を復元しました`,
        },
      };
    } catch {
      // 壊れた自動保存は捨てて題材を開く
    }
  }
  return { project: loadExample(), file: { name: EXAMPLE_FILE_NAME } };
}

const storage = localStorageOrUndefined();
const store = createEditorStore(initialState(storage));
startAutosave(store, storage);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <EditorContext.Provider value={store}>
      <App />
    </EditorContext.Provider>
  </StrictMode>,
);
