import type { Project } from "@ui-editor/schema";
import { useState } from "react";
import { DataModelView } from "./data-model/DataModelView";
import { loadExampleProject } from "./example";

type Tab = "dataModel";

const TABS: Record<Tab, string> = {
  dataModel: "データモデル",
};

export function App() {
  const [project, setProject] = useState<Project>(loadExampleProject);
  const [tab, setTab] = useState<Tab>("dataModel");

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
      </header>
      <main className="app-body">
        {tab === "dataModel" && (
          <DataModelView
            source={project.dataModel.source}
            onChange={(source) =>
              setProject((p) => ({ ...p, dataModel: { ...p.dataModel, source } }))
            }
          />
        )}
      </main>
    </div>
  );
}
