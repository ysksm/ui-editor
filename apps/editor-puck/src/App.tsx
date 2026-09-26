import { Puck, type Data } from "@puckeditor/core";
import {
  formatFromPath,
  formatIssue,
  validateProject,
  type Project,
  type ProjectFormat,
} from "@ui-editor/schema";
import { useEffect, useMemo, useRef, useState } from "react";
import { puckToTree, treeToPuck } from "./convert/convert.ts";
import { BUILTIN_TYPES, createConfig } from "./puck/config.tsx";
import {
  createComponent,
  createDialog,
  cyclicComponents,
  extractComponent,
  getParams,
  setParams,
  type OpResult,
} from "./project/components.ts";
import {
  clearStorage,
  downloadProject,
  loadExample,
  loadFromStorage,
  parseProject,
  saveToStorage,
} from "./project/storage.ts";
import {
  getTree,
  kindLabel,
  listTargets,
  sameTarget,
  setTree,
  type Target,
} from "./project/targets.ts";
import { ExtractAction } from "./ui/ExtractAction.tsx";
import { NewItemForm, type NewItemKind } from "./ui/NewItemForm.tsx";
import { ParamsPanel } from "./ui/ParamsPanel.tsx";

function firstTarget(project: Project): Target {
  const entry = project.screens.find((s) => s.id === project.entry) ?? project.screens[0]!;
  return { kind: "screen", id: entry.id };
}

type Message = { kind: "info" | "error"; lines: string[] };

export function App() {
  const [project, setProject] = useState<Project>(() => loadFromStorage() ?? loadExample());
  const [target, setTarget] = useState<Target>(() => firstTarget(project));
  /** 読み込みのたびに増やし、Puck を作り直す。 */
  const [generation, setGeneration] = useState(0);
  const [format, setFormat] = useState<ProjectFormat>("yaml");
  const [message, setMessage] = useState<Message | null>(null);
  const [treeError, setTreeError] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => saveToStorage(project), [project]);

  // Puck は data を初回だけ読むので、画面の切り替え・読み込み時にだけ作り直す。
  // 編集中の onChange による project の変更では作り直さない（依存に project を入れない）。
  const initialData = useMemo<Data | undefined>(() => {
    const root = getTree(project, target);
    return root && treeToPuck(root);
  }, [target, generation]);

  // コンポーネントを編集中は、自分自身と自分を使うコンポーネントをパレットから外す（循環するため）。
  const config = useMemo(
    () =>
      createConfig(
        project.components,
        target.kind === "component" ? cyclicComponents(project, target.id) : undefined,
      ),
    // components が変わったときだけ作り直す（画面の編集では components は同じ参照のまま）
    [project.components, target],
  );

  const targets = listTargets(project);

  /** プロジェクトを操作し、成功したら Puck を作り直す。失敗したらメッセージを返す。 */
  function apply(result: OpResult, next?: Target): string | undefined {
    if (!result.ok) return result.message;
    setProject(result.project);
    if (next) setTarget(next);
    setGeneration((g) => g + 1);
    setTreeError(null);
    return undefined;
  }

  function create(kind: NewItemKind, id: string, name: string): string | undefined {
    const result =
      kind === "component"
        ? createComponent(project, id, name, BUILTIN_TYPES)
        : createDialog(project, id, name);
    const message = apply(result, { kind, id });
    if (!message) {
      setShowNew(false);
      setMessage({ kind: "info", lines: [`${kindLabel(kind)} ${id} を作成しました`] });
    }
    return message;
  }

  function extract(nodeId: string, id: string): string | undefined {
    const message = apply(extractComponent(project, target, nodeId, id, "", BUILTIN_TYPES));
    if (!message) {
      setMessage({
        kind: "info",
        lines: [
          `${nodeId} をコンポーネント ${id} にしました。上のタブから中身と props を編集できます`,
        ],
      });
    }
    return message;
  }

  function replaceProject(next: Project, note: string) {
    setProject(next);
    setTarget(firstTarget(next));
    setGeneration((g) => g + 1);
    setTreeError(null);
    setMessage({ kind: "info", lines: [note] });
  }

  async function openFile(file: File) {
    let fileFormat: ProjectFormat;
    try {
      fileFormat = formatFromPath(file.name);
    } catch (e) {
      setMessage({ kind: "error", lines: [(e as Error).message] });
      return;
    }
    const result = parseProject(await file.text(), fileFormat);
    if (!result.ok) {
      setMessage({ kind: "error", lines: [`${file.name} を読み込めません`, ...result.errors] });
      return;
    }
    setFormat(fileFormat);
    replaceProject(result.project, `${file.name} を読み込みました`);
  }

  function save() {
    const result = validateProject(project);
    if (!result.success) {
      setMessage({
        kind: "error",
        lines: ["検証エラーがあるため保存できません", ...result.issues.map(formatIssue)],
      });
      return;
    }
    downloadProject(result.project, format, "device-monitor");
    setMessage({ kind: "info", lines: [`P0 形式（${format}）で保存しました`] });
  }

  function onChange(data: Data) {
    const result = puckToTree(data);
    if (!result.ok) {
      setTreeError(result.message);
      return;
    }
    setTreeError(null);
    setProject((prev) => setTree(prev, target, result.root));
  }

  const current = targets.find((t) => sameTarget(t, target));

  return (
    <div className="app">
      <header className="app__bar">
        <nav className="app__tabs">
          {targets.map((t) => (
            <button
              key={`${t.kind}:${t.id}`}
              type="button"
              className="app__tab"
              aria-current={sameTarget(t, target)}
              onClick={() => setTarget(t)}
            >
              <span className="app__tab-kind">{kindLabel(t.kind)}</span>
              {t.label}
            </button>
          ))}
        </nav>
        <div className="app__actions">
          <input
            ref={fileInput}
            type="file"
            accept=".json,.yaml,.yml"
            hidden
            onChange={(e) => {
              const file = e.currentTarget.files?.[0];
              e.currentTarget.value = "";
              if (file) void openFile(file);
            }}
          />
          <button type="button" onClick={() => setShowNew((v) => !v)}>
            ＋ 新規
          </button>
          <button type="button" onClick={() => fileInput.current?.click()}>
            開く…
          </button>
          <button
            type="button"
            onClick={() => {
              clearStorage();
              replaceProject(loadExample(), "題材ファイルを読み込みました");
            }}
          >
            題材を読み込む
          </button>
          <select
            aria-label="保存形式"
            value={format}
            onChange={(e) => setFormat(e.currentTarget.value as ProjectFormat)}
          >
            <option value="yaml">YAML</option>
            <option value="json">JSON</option>
          </select>
          <button type="button" className="app__primary" onClick={save}>
            保存（ダウンロード）
          </button>
        </div>
      </header>
      {showNew && <NewItemForm onCreate={create} onClose={() => setShowNew(false)} />}
      {target.kind !== "screen" && (
        <ParamsPanel
          key={`${generation}:${target.kind}:${target.id}`}
          title={target.kind === "component" ? "props の定義" : "params の定義"}
          hint={
            target.kind === "component"
              ? "中のパーツから {{ props.名前 }} で参照する。インスタンスの右パネルに欄が出る"
              : "中のパーツから {{ params.名前 }} で参照する。openDialog で渡す"
          }
          params={getParams(project, target)}
          onChange={(params) => setProject((prev) => setParams(prev, target, params))}
        />
      )}
      {(message || treeError) && (
        <div className="app__messages">
          {treeError && <p className="app__message app__message--error">{treeError}</p>}
          {message && (
            <div className={`app__message app__message--${message.kind}`}>
              {message.lines.map((line, i) => (
                <div key={i}>{line}</div>
              ))}
              <button type="button" onClick={() => setMessage(null)}>
                閉じる
              </button>
            </div>
          )}
        </div>
      )}
      <div className="app__editor">
        {initialData && (
          <Puck
            key={`${generation}:${target.kind}:${target.id}`}
            config={config}
            data={initialData}
            onChange={onChange}
            headerTitle={current && `${kindLabel(current.kind)}: ${current.label}`}
            renderHeaderActions={() => <ExtractAction onExtract={extract} />}
            height="100%"
          />
        )}
      </div>
    </div>
  );
}
