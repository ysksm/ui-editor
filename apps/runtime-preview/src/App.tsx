import type { Project, ProjectFormat } from "@ui-editor/schema";
import { useState } from "react";
import { ActionsView } from "./actions/ActionsView";
import { BindingView } from "./binding/BindingView";
import { DataModelView } from "./data-model/DataModelView";
import { EXAMPLE_FILE_NAME, loadExampleProject } from "./example";
import { downloadText, fileNameFor, projectFromText, projectToText } from "./project-file";
import { SampleDataView } from "./sample-data/SampleDataView";

type Tab = "dataModel" | "sampleData" | "binding" | "actions";

const TABS: Record<Tab, string> = {
  dataModel: "データモデル",
  sampleData: "サンプルデータ",
  binding: "式",
  actions: "イベント",
};

/** 再読み込みしても同じタブを開けるよう、タブは URL の hash に持つ。 */
function initialTab(): Tab {
  const hash = location.hash.slice(1);
  return hash in TABS ? (hash as Tab) : "dataModel";
}

export function App() {
  const [project, setProject] = useState<Project>(loadExampleProject);
  const [fileName, setFileName] = useState(EXAMPLE_FILE_NAME);
  const [tab, setTabState] = useState<Tab>(initialTab);
  const [errors, setErrors] = useState<string[]>([]);

  const setTab = (t: Tab) => {
    setTabState(t);
    history.replaceState(null, "", `#${t}`);
  };

  const save = (format: ProjectFormat) => {
    const result = projectToText(project, format);
    if (!result.ok) return setErrors(["保存できません（検証エラー）", ...result.errors]);
    setErrors([]);
    downloadText(result.value, fileNameFor(fileName, format));
  };

  const open = async (file: File) => {
    const result = projectFromText(await file.text(), file.name);
    if (!result.ok) return setErrors([`${file.name} を開けません`, ...result.errors]);
    setErrors([]);
    setProject(result.value);
    setFileName(file.name);
  };

  return (
    <div className="app">
      <header className="app-header">
        <strong>{project.name}</strong>
        <nav className="tabs">
          {(Object.keys(TABS) as Tab[]).map((t) => (
            <button key={t} className={tab === t ? "tab active" : "tab"} onClick={() => setTab(t)}>
              {TABS[t]}
            </button>
          ))}
        </nav>
        <div className="header-actions">
          <span className="muted small">{fileName}</span>
          <label className="button">
            開く
            <input
              type="file"
              accept=".json,.yaml,.yml"
              hidden
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (file) void open(file);
              }}
            />
          </label>
          <button className="button" onClick={() => save("yaml")}>
            保存（YAML）
          </button>
          <button className="button" onClick={() => save("json")}>
            保存（JSON）
          </button>
        </div>
      </header>
      {errors.length > 0 && (
        <ul className="diagnostics banner" onClick={() => setErrors([])} title="クリックで閉じる">
          {errors.map((e, i) => (
            <li key={i}>{e}</li>
          ))}
        </ul>
      )}
      <main className="app-body">
        {tab === "dataModel" && (
          <DataModelView
            source={project.dataModel.source}
            onChange={(source) =>
              setProject((p) => ({ ...p, dataModel: { ...p.dataModel, source } }))
            }
          />
        )}
        {tab === "sampleData" && (
          <SampleDataView
            dataModelSource={project.dataModel.source}
            sampleData={project.sampleData}
            onChange={(sampleData) => setProject((p) => ({ ...p, sampleData }))}
          />
        )}
        {tab === "binding" && <BindingView project={project} />}
        {tab === "actions" && <ActionsView project={project} onChange={setProject} />}
      </main>
    </div>
  );
}
