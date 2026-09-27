import type { Project } from "@ui-editor/schema";
// P3（apps/editor-craft）のエディタを書き換えずに import して使う
import { App } from "@ui-editor/editor-craft/src/App";
import { EXAMPLE_FILENAME, loadExampleProject } from "@ui-editor/editor-craft/src/project/example";
import { importProject } from "@ui-editor/editor-craft/src/project/io";
import { useState } from "react";
import { fileNameOf, siblingPath, tauriFiles, type LocalFiles } from "./files";

interface Opened {
  project: Project;
  filename: string;
  /** ローカルのパス。題材ファイル（同梱）のときは無い。 */
  path?: string;
  /** 開き直すたびに App を作り直すための番号。 */
  seq: number;
}

type Status = { kind: "info" | "error"; text: string };

export function DesktopApp({ files = tauriFiles }: { files?: LocalFiles }) {
  const [opened, setOpened] = useState<Opened>(() => ({
    project: loadExampleProject(),
    filename: EXAMPLE_FILENAME,
    seq: 0,
  }));
  const [status, setStatus] = useState<Status>();

  const openLocal = async () => {
    try {
      const file = await files.open();
      if (!file) return;
      const filename = fileNameOf(file.path);
      const result = importProject(file.text, filename);
      if (!result.ok) {
        setStatus({
          kind: "error",
          text: `${filename} を読み込めません: ${result.errors.join(" / ")}`,
        });
        return;
      }
      setOpened((o) => ({ project: result.project, filename, path: file.path, seq: o.seq + 1 }));
      setStatus({ kind: "info", text: `${file.path} を開きました` });
    } catch (e) {
      setStatus({ kind: "error", text: `開けません: ${String(e)}` });
    }
  };

  // エディタの「JSON で保存」「YAML で保存」の書き出し先。ブラウザのダウンロードの代わりにローカルに書く
  const saveLocal = async (filename: string, text: string) => {
    try {
      // 開いたファイルと同じ名前（＝同じ形式）なら上書きする。エディタ側の「開く」で別のファイルに
      // 切り替えた場合は名前が変わるので、上書きせずに保存先を聞く
      if (opened.path && fileNameOf(opened.path) === filename) {
        await files.write(opened.path, text);
        setStatus({ kind: "info", text: `${opened.path} に上書き保存しました` });
        return;
      }
      const path = await files.saveAs(siblingPath(opened.path, filename), text);
      if (!path) return;
      setOpened((o) => ({ ...o, path, filename: fileNameOf(path) }));
      setStatus({ kind: "info", text: `${path} に保存しました` });
    } catch (e) {
      setStatus({ kind: "error", text: `保存できません: ${String(e)}` });
    }
  };

  return (
    <div className="desktop">
      <div className="desktop-bar">
        <button type="button" onClick={() => void openLocal()}>
          ローカルのファイルを開く…
        </button>
        <span className="desktop-path" title={opened.path}>
          {opened.path ?? `${opened.filename}（同梱の題材・未保存）`}
        </span>
        {status && (
          <span className={`desktop-status desktop-status--${status.kind}`} role="status">
            {status.text}
          </span>
        )}
      </div>
      <App
        key={opened.seq}
        initialProject={opened.project}
        initialFilename={opened.filename}
        onDownload={(filename, text) => void saveLocal(filename, text)}
      />
    </div>
  );
}
