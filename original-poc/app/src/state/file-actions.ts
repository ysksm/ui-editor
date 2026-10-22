import { createEmptyProject } from "@ui-editor/poc-model";
import { EXAMPLE_FILE_NAME, loadExample } from "../example";
import {
  CodeExportError,
  downloadZip,
  generateCode,
  isEmptyDirectory,
  pickDirectory,
  writeToDirectory,
} from "./code-export";
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
    /** コードを書き出す（フォルダを選ぶ。API が無ければ zip をダウンロード）。 */
    exportCode: async () => {
      const { project, file } = s();
      try {
        const { appName, files } = await generateCode(project, file?.name);
        const dir = await pickDirectory();
        if (dir === null) return; // キャンセル
        if (dir === undefined) {
          downloadZip(appName, files);
          s().setNotice({
            kind: "info",
            text: `${appName}.zip（${files.length} ファイル）をダウンロードしました。展開したフォルダで pnpm install && pnpm dev で動かせます`,
          });
          return;
        }
        const write = async () => {
          try {
            await writeToDirectory(dir, files);
            s().setNotice({
              kind: "info",
              text: `フォルダ「${dir.name}」に ${files.length} ファイルを書き出しました。pnpm install && pnpm dev で動かせます`,
            });
          } catch (e) {
            s().setNotice({ kind: "error", text: `書き出せませんでした: ${(e as Error).message}` });
          }
        };
        if (await isEmptyDirectory(dir)) await write();
        else
          s().requestConfirm(
            `フォルダ「${dir.name}」には既にファイルがあります。生成したファイルで上書きします（ほかのファイルはそのまま）。続けますか？`,
            "上書きして書き出す",
            () => void write(),
          );
      } catch (e) {
        const text =
          e instanceof CodeExportError
            ? `コードを書き出せません:\n${summarize(e.problems)}`
            : `コードを書き出せません: ${(e as Error).message}`;
        s().setNotice({ kind: "error", text });
      }
    },
  };
}

/** 理由が多いときは先頭の 10 件だけ。 */
function summarize(problems: readonly string[]): string {
  const head = problems.slice(0, 10).join("\n");
  return problems.length > 10 ? `${head}\nほか ${problems.length - 10} 件` : head;
}

export function useFileActions() {
  return fileActions(useEditorStore());
}
