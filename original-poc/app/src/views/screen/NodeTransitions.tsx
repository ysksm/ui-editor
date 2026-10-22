import {
  addTransitionFrom,
  containers,
  extractTransitions,
  setTrigger,
  type Container,
  type Node,
  type Project,
} from "@ui-editor/poc-model";
import { useState } from "react";
import { useEditor } from "../../state/store";
import { triggerLabel } from "../flow/graph";

/**
 * 部品の遷移（FR-UI-03）: この部品の遷移、遷移を作る（仮の部品を経ない）、
 * この画面の仮の部品のままの遷移をこの部品に移す。
 */
export function NodeTransitions({
  project,
  container,
  node,
}: {
  project: Project;
  container: Container;
  node: Node;
}) {
  const edit = useEditor((s) => s.edit);
  const select = useEditor((s) => s.select);
  const setView = useEditor((s) => s.setView);
  const all = containers(project);
  const name = (id: string) => all.find((c) => c.container.id === id)?.container.name ?? id;
  const transitions = extractTransitions(project).filter((t) => t.from === container.id);
  const own = transitions.filter((t) => t.node === node.id);
  const canMove = node.type === "Button" || node.type === "Table";
  const placeholders = canMove
    ? transitions.filter((t) => t.placeholder && t.node !== node.id && !t.onClose)
    : [];
  const [to, setTo] = useState(
    all.find((c) => c.container.id !== container.id)?.container.id ?? "",
  );
  const open = (key: string) => {
    setView("flow");
    select({ kind: "transition", key });
  };
  return (
    <div className="node-transitions" role="group" aria-label="部品の遷移">
      <h5>遷移</h5>
      {own.length > 0 && (
        <ul className="transition-list" aria-label="この部品の遷移">
          {own.map((t) => (
            <li key={t.key}>
              <button
                className="transition-item"
                onClick={() => open(t.key)}
                title="フロー図で開く"
              >
                <span>→ {name(t.to)}</span>
                <span className="muted small">{t.event}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="relation-form">
        <select aria-label="遷移先" value={to} onChange={(e) => setTo(e.target.value)}>
          {all.map((c) => (
            <option key={c.container.id} value={c.container.id}>
              {c.kind === "screen" ? "画面" : "ダイアログ"}: {c.container.name}
            </option>
          ))}
        </select>
        <button
          disabled={!to}
          onClick={() =>
            edit(
              `遷移を追加（${node.id} → ${to}）`,
              (d) => void addTransitionFrom(d, container.id, node.id, to),
            )
          }
        >
          遷移を追加
        </button>
      </div>
      {placeholders.length > 0 && (
        <>
          <p className="muted small">この画面の仮の部品のままの遷移を、この部品に移す:</p>
          <ul className="transition-list" aria-label="仮の部品の遷移">
            {placeholders.map((t) => (
              <li key={t.key} className="placeholder-transition">
                <span>
                  → {name(t.to)} <span className="muted small">（{triggerLabel(t)}）</span>
                </span>
                <button
                  onClick={() =>
                    edit(
                      "仮の部品の遷移を移す",
                      (d) =>
                        void setTrigger(
                          d,
                          t.key,
                          node.type === "Table"
                            ? { kind: "rowClick", node: node.id }
                            : { kind: "button", node: node.id },
                        ),
                    )
                  }
                >
                  この部品に移す
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
