import { createEmptyProject } from "@ui-editor/poc-model";
import { EXAMPLE_FILE_NAME, loadExample } from "../example";
import { openProjectFile, parseProjectFile, saveProjectFile } from "./files";
import { useEditorStore, type EditorStore } from "./store";

const DISCARD = "保存していない変更があります。破棄して";

/** ヘッダーとショートカットから使うファイル操作。 */
export function fileActions(store: EditorStore) {
  const s = () => store.getState();
  return {
    newProject: () =>
      s().confirmDiscard(`${DISCARD}新しいプロジェクトを作りますか？`, "破棄して新規作成", () => {
        s().replaceProject(createEmptyProject(), null);
        s().setNotice({ kind: "info", text: "新しいプロジェクトを作りました" });
      }),
    openExample: () =>
      s().confirmDiscard(`${DISCARD}題材を開きますか？`, "破棄して題材を開く", () => {
        s().replaceProject(loadExample(), { name: EXAMPLE_FILE_NAME });
        s().setNotice({ kind: "info", text: "題材「機器の設定＆モニタリング」を開きました" });
      }),
    open: () =>
      s().confirmDiscard(`${DISCARD}ファイルを開きますか？`, "破棄して開く", () => {
        void (async () => {
          try {
            const file = await openProjectFile();
            if (!file) return;
            s().replaceProject(parseProjectFile(file.text), {
              name: file.name,
              handle: file.handle,
            });
            s().setNotice({ kind: "info", text: `${file.name} を開きました` });
          } catch (e) {
            s().setNotice({ kind: "error", text: `開けませんでした:\n${(e as Error).message}` });
          }
        })();
      }),
    save: async (saveAs = false) => {
      try {
        const { project, file } = s();
        const saved = await saveProjectFile(project, file, saveAs);
        if (!saved) return;
        s().markSaved({ name: saved.name, handle: saved.handle });
        s().setNotice({
          kind: "info",
          text: saved.downloaded
            ? `${saved.name} をダウンロードしました`
            : `${saved.name} に保存しました`,
        });
      } catch (e) {
        s().setNotice({ kind: "error", text: `保存できませんでした: ${(e as Error).message}` });
      }
    },
  };
}

export function useFileActions() {
  return fileActions(useEditorStore());
}
