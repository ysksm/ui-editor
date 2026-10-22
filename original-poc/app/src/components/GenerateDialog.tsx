import { nestParents } from "@ui-editor/poc-model";
import { useState } from "react";
import { useEditor, useEditorStore } from "../state/store";
import { generateFor } from "./generate";

const PARTS = [
  { key: "list", label: "一覧（画面）" },
  { key: "detail", label: "詳細（画面）" },
  { key: "form", label: "作成／編集フォーム（ダイアログ）" },
  { key: "confirm", label: "削除の確認（ダイアログ）" },
] as const;

/** エンティティと作るものを選んで、画面・遷移を生成する（FR-GEN-01）。 */
export function GenerateDialog({ onClose }: { onClose: () => void }) {
  const project = useEditor((s) => s.project);
  const select = useEditor((s) => s.select);
  const store = useEditorStore();
  const [entity, setEntity] = useState(project.entities[0]?.id ?? "");
  const [parts, setParts] = useState({ list: true, detail: true, form: true, confirm: true });
  const nested = nestParents(project.entities).get(entity);
  return (
    <div className="modal-backdrop">
      <div className="modal" role="dialog" aria-modal="true" aria-label="ER から画面を生成">
        <h3>ER から画面を生成</h3>
        <label className="row">
          <span>エンティティ</span>
          <select
            aria-label="生成するエンティティ"
            value={entity}
            onChange={(e) => setEntity(e.target.value)}
          >
            {project.entities.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}（{e.id}）
              </option>
            ))}
          </select>
        </label>
        <fieldset className="generate-parts">
          <legend>作るもの</legend>
          {PARTS.map((p) => (
            <label key={p.key} className="inline">
              <input
                type="checkbox"
                checked={parts[p.key]}
                onChange={(e) => setParts({ ...parts, [p.key]: e.target.checked })}
              />
              {p.label}
            </label>
          ))}
        </fieldset>
        {nested && (
          <p className="muted small">
            {entity} は {nested.parent} の入れ子なので、追加は {nested.parent}{" "}
            の詳細の子の一覧から行います（一覧に「新規」は置きません）。
          </p>
        )}
        <div className="modal-actions">
          <button onClick={onClose}>やめる</button>
          <button
            className="primary"
            disabled={!entity || !Object.values(parts).some(Boolean)}
            onClick={() => {
              onClose();
              const r = generateFor(store, entity, parts);
              const first = r.list ?? r.detail ?? r.form ?? r.confirm;
              if (first) select({ kind: "container", id: first });
            }}
          >
            生成する
          </button>
        </div>
      </div>
    </div>
  );
}
