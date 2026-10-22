import { defaultCounts, DEFAULT_SEED, generateSampleData } from "@ui-editor/poc-seed";
import { nestParents, type Project } from "@ui-editor/poc-model";
import { useState } from "react";
import { useEditorStore } from "../../state/store";

/** 件数とシードを指定してサンプルデータを作り、今のデータと置き換える（FR-ER-04）。 */
export function SeedDialog({ project, onClose }: { project: Project; onClose: () => void }) {
  const store = useEditorStore();
  const parents = nestParents(project.entities);
  const [counts, setCounts] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      Object.entries(defaultCounts(project.entities)).map(([k, v]) => [k, String(v)]),
    ),
  );
  const [seed, setSeed] = useState(String(DEFAULT_SEED));
  const parsed = Object.fromEntries(
    Object.entries(counts).map(([k, v]) => [k, Math.max(0, Math.floor(Number(v) || 0))]),
  );
  const run = () => {
    const result = generateSampleData(project.entities, {
      counts: parsed,
      seed: Math.floor(Number(seed) || DEFAULT_SEED),
    });
    onClose();
    if (store.getState().edit("サンプルデータを生成", (d) => void (d.data = result.data))) {
      const made = project.entities
        .map((e) => `${e.name} ${result.counts[e.id] ?? 0} 件`)
        .join("、");
      store.getState().setNotice({
        kind: result.warnings.length ? "error" : "info",
        text: [`サンプルデータを生成しました（${made}）`, ...result.warnings].join("\n"),
      });
    }
  };
  return (
    <div className="modal-backdrop">
      <div
        className="modal seed-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="サンプルデータの生成"
      >
        <h3>サンプルデータの生成</h3>
        <p className="muted small">
          今のデータは置き換わります（元に戻すで戻せます）。入れ子のエンティティの件数は、全親の合計です。
        </p>
        <table>
          <tbody>
            {project.entities.map((e) => {
              const p = parents.get(e.id);
              return (
                <tr key={e.id}>
                  <th>
                    {e.name}
                    <span className="muted small">
                      {p ? `（${p.parent} の${p.cardinality === "one" ? " 1 件" : "子"}）` : ""}
                    </span>
                  </th>
                  <td>
                    <input
                      type="number"
                      min={0}
                      aria-label={`${e.name}の件数`}
                      value={counts[e.id] ?? "0"}
                      onChange={(ev) => setCounts({ ...counts, [e.id]: ev.target.value })}
                    />
                  </td>
                </tr>
              );
            })}
            <tr>
              <th>シード</th>
              <td>
                <input
                  type="number"
                  aria-label="シード"
                  value={seed}
                  onChange={(e) => setSeed(e.target.value)}
                />
              </td>
            </tr>
          </tbody>
        </table>
        <div className="modal-actions">
          <button onClick={onClose}>やめる</button>
          <button className="primary" onClick={run} disabled={project.entities.length === 0}>
            生成して置き換える
          </button>
        </div>
      </div>
    </div>
  );
}
