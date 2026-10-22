import { useState } from "react";
import { useEditor } from "../state/store";
import { EntityTree } from "./data/EntityTree";
import { JsonView } from "./data/JsonView";
import { NestedTree } from "./data/NestedTree";
import { RecordTable } from "./data/RecordTable";
import { SeedDialog } from "./data/SeedDialog";

type Mode = "table" | "tree" | "json";

/** サンプルデータ（FR-ER-04〜06）: エンティティごとの表、入れ子の木、JSON、生成。 */
export function DataView() {
  const project = useEditor((s) => s.project);
  const selection = useEditor((s) => s.selection);
  const select = useEditor((s) => s.select);
  const [mode, setMode] = useState<Mode>("table");
  const [seeding, setSeeding] = useState(false);
  const selected = selection?.kind === "data" ? selection.entity : project.entities[0]?.id;
  const entity = project.entities.find((e) => e.id === selected) ?? project.entities[0];
  const highlight = selection?.kind === "data" ? selection.id : undefined;

  return (
    <div className="data-view">
      <div className="view-toolbar">
        <button
          className="primary"
          onClick={() => setSeeding(true)}
          disabled={project.entities.length === 0}
        >
          サンプルデータを生成…
        </button>
        <span className="segmented" role="group" aria-label="表示">
          {(
            [
              ["table", "表"],
              ["tree", "入れ子の木"],
              ["json", "JSON"],
            ] as const
          ).map(([m, label]) => (
            <button key={m} aria-pressed={mode === m} onClick={() => setMode(m)}>
              {label}
            </button>
          ))}
        </span>
      </div>
      {project.entities.length === 0 ? (
        <p className="placeholder muted">
          ER ビューでエンティティを作ると、ここでデータを編集できます。
        </p>
      ) : (
        <div className="data-body">
          {mode === "table" && (
            <>
              <EntityTree
                project={project}
                selected={entity?.id}
                onSelect={(id) => select({ kind: "data", entity: id })}
              />
              <section className="data-main">
                {entity && (
                  <>
                    <h3>
                      {entity.name}
                      <code className="muted">{entity.id}</code>
                    </h3>
                    <RecordTable key={entity.id} entity={entity} highlight={highlight} />
                  </>
                )}
              </section>
            </>
          )}
          {mode === "tree" && (
            <section className="data-main wide">
              <NestedTree
                project={project}
                onOpen={(e, id) => {
                  select({ kind: "data", entity: e, id });
                  setMode("table");
                }}
              />
            </section>
          )}
          {mode === "json" && (
            <section className="data-main wide">
              <JsonView project={project} />
            </section>
          )}
        </div>
      )}
      {seeding && <SeedDialog project={project} onClose={() => setSeeding(false)} />}
    </div>
  );
}
