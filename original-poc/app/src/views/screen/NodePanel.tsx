import {
  bindingCandidates,
  moveNode,
  NODE_EVENTS,
  nodeIdProblem,
  removeNode,
  renameNodeId,
  updateNode,
  type BuiltinNodeType,
  type Container,
  type JsonValue,
  type Node,
  type Project,
} from "@ui-editor/poc-model";
import { ActionListEditor } from "../../components/actions/ActionListEditor";
import { BindingCandidates, BindingInput } from "../../components/form/BindingInput";
import { CommitInput } from "../../components/form/CommitInput";
import { useEditor } from "../../state/store";

const VARIANTS: Partial<Record<BuiltinNodeType, string[]>> = {
  Text: ["title", "body", "caption"],
  Button: ["primary", "secondary", "danger"],
};

/** JSON の値を入力欄の文字列に（文字列はそのまま、ほかは JSON）。 */
const asText = (v: JsonValue | undefined) =>
  v === undefined ? "" : typeof v === "string" ? v : JSON.stringify(v);

/** 選んだ部品のパネル（FR-UI-01・02）: id・props・visible・イベント。 */
export function NodePanel({
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
  const cid = container.id;
  const props = node.props ?? {};
  const listId = `candidates-${cid}`;
  const tableEntity =
    node.type === "Table" && typeof props.entity === "string" ? props.entity : undefined;
  const rowListId = `candidates-${cid}-row`;
  const setProp = (key: string, value: JsonValue | undefined) =>
    edit(`${node.type} の ${key} を変更`, (d) =>
      updateNode(d, cid, node.id, { props: { [key]: value } }),
    );
  const text = (key: string, label: string, binding = true) => (
    <label className="row">
      <span>{label}</span>
      {binding ? (
        <BindingInput
          aria-label={`${label}（${node.id}）`}
          listId={listId}
          value={asText(props[key])}
          onCommit={(v) => setProp(key, v === "" ? undefined : v)}
        />
      ) : (
        <CommitInput
          aria-label={`${label}（${node.id}）`}
          value={asText(props[key])}
          onCommit={(v) => setProp(key, v === "" ? undefined : v)}
        />
      )}
    </label>
  );
  const type = node.type as BuiltinNodeType;
  const events = NODE_EVENTS[type] ?? [];

  return (
    <section className="node-panel" aria-label="部品の編集">
      <BindingCandidates id={listId} candidates={bindingCandidates(project, cid)} />
      {tableEntity && (
        <BindingCandidates
          id={rowListId}
          candidates={bindingCandidates(project, cid, { tableEntity })}
        />
      )}
      <h4>
        <code className="outline-type">{node.type}</code>
        <CommitInput
          aria-label="部品の id"
          className="node-id"
          value={node.id}
          validate={(v) => nodeIdProblem(container, v, node.id)}
          onCommit={(v) => {
            if (edit("部品の id を変更", (d) => renameNodeId(d, cid, node.id, v)))
              select({ kind: "node", container: cid, node: v });
          }}
        />
        <span className="node-buttons">
          <button
            className="link"
            aria-label="部品を上へ"
            onClick={() => edit("部品を並べ替え", (d) => moveNode(d, cid, node.id, -1))}
          >
            ↑
          </button>
          <button
            className="link"
            aria-label="部品を下へ"
            onClick={() => edit("部品を並べ替え", (d) => moveNode(d, cid, node.id, 1))}
          >
            ↓
          </button>
          <button
            className="link"
            aria-label="部品を削除"
            onClick={() => {
              if (edit("部品を削除", (d) => removeNode(d, cid, node.id)))
                select({ kind: "container", id: cid });
            }}
          >
            ×
          </button>
        </span>
      </h4>
      {node.placeholder && (
        <p className="small">
          <span className="placeholder-count">仮の部品</span>{" "}
          <button
            onClick={() =>
              edit("本物の部品にする", (d) => updateNode(d, cid, node.id, { placeholder: false }))
            }
          >
            本物の部品にする
          </button>
        </p>
      )}

      {type === "Box" && (
        <>
          <label className="row">
            <span>並び</span>
            <select
              aria-label={`並び（${node.id}）`}
              value={String(props.direction ?? "column")}
              onChange={(e) => setProp("direction", e.target.value)}
            >
              <option value="column">縦</option>
              <option value="row">横</option>
            </select>
          </label>
          <label className="row">
            <span>間隔</span>
            <CommitInput
              aria-label={`間隔（${node.id}）`}
              inputMode="numeric"
              value={asText(props.gap)}
              onCommit={(v) =>
                setProp("gap", v === "" ? undefined : Number.isFinite(Number(v)) ? Number(v) : v)
              }
            />
          </label>
        </>
      )}
      {type === "Text" && text("text", "文言")}
      {type === "Button" && (
        <>
          {text("label", "文言")}
          <label className="row">
            <span>要る選択</span>
            <select
              aria-label={`要る選択（${node.id}）`}
              value={asText(props.requires)}
              onChange={(e) => setProp("requires", e.target.value || undefined)}
            >
              <option value="">（なし）</option>
              {project.entities.map((e) => (
                <option key={e.id} value={`selection.${e.id}`}>
                  {e.name}を選んでいる（selection.{e.id}）
                </option>
              ))}
            </select>
          </label>
          {text("disabled", "無効")}
        </>
      )}
      {(type === "TextInput" || type === "NumberInput" || type === "Select") && (
        <>
          {text("label", "ラベル")}
          {text("value", "値")}
          {text("error", "エラー")}
          {type === "Select" && text("options", "選択肢")}
        </>
      )}
      {type === "Checkbox" && (
        <>
          {text("label", "ラベル")}
          {text("checked", "チェック")}
        </>
      )}
      {VARIANTS[type] && (
        <label className="row">
          <span>見た目</span>
          <select
            aria-label={`見た目（${node.id}）`}
            value={asText(props.variant)}
            onChange={(e) => setProp("variant", e.target.value || undefined)}
          >
            <option value="">（既定）</option>
            {VARIANTS[type]!.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        </label>
      )}
      {type === "Table" && (
        <TableProps
          project={project}
          node={node}
          listId={listId}
          rowListId={tableEntity ? rowListId : listId}
          setProp={setProp}
        />
      )}
      <label className="row">
        <span>表示条件</span>
        <BindingInput
          aria-label={`表示条件（${node.id}）`}
          listId={listId}
          placeholder="常に表示"
          value={
            typeof node.visible === "string" ? node.visible : node.visible === false ? "false" : ""
          }
          onCommit={(v) =>
            edit("表示条件を変更", (d) =>
              updateNode(d, cid, node.id, { visible: v === "false" ? false : v || undefined }),
            )
          }
        />
      </label>
      {events.map((event) => (
        <div key={event} className="node-event">
          <h5>{event} のアクション</h5>
          <ActionListEditor
            project={project}
            label={`${event} のアクション`}
            actions={node.events?.[event] ?? []}
            onChange={(actions) =>
              edit(`${event} のアクションを変更`, (d) =>
                updateNode(d, cid, node.id, { events: { ...node.events, [event]: actions } }),
              )
            }
          />
        </div>
      ))}
    </section>
  );
}

/** 表: 行・エンティティ・選択・列（見出しと値）。 */
function TableProps({
  project,
  node,
  listId,
  rowListId,
  setProp,
}: {
  project: Project;
  node: Node;
  listId: string;
  rowListId: string;
  setProp: (key: string, value: JsonValue | undefined) => void;
}) {
  const props = node.props ?? {};
  const columns = Array.isArray(props.columns)
    ? (props.columns as { header?: string; value?: string }[])
    : [];
  const setColumns = (next: { header?: string; value?: string }[]) =>
    setProp("columns", next as JsonValue);
  return (
    <>
      <label className="row">
        <span>行</span>
        <BindingInput
          aria-label={`行（${node.id}）`}
          listId={listId}
          value={asText(props.rows)}
          onCommit={(v) => setProp("rows", v || undefined)}
        />
      </label>
      <label className="row">
        <span>行の種類</span>
        <select
          aria-label={`行のエンティティ（${node.id}）`}
          value={asText(props.entity)}
          onChange={(e) => setProp("entity", e.target.value || undefined)}
        >
          <option value="">（なし）</option>
          {project.entities.map((e) => (
            <option key={e.id} value={e.id}>
              {e.name}（{e.id}）
            </option>
          ))}
        </select>
      </label>
      <label className="row">
        <span>選択</span>
        <input
          type="checkbox"
          aria-label={`行を選べる（${node.id}）`}
          checked={props.selectable === true}
          onChange={(e) => setProp("selectable", e.target.checked || undefined)}
        />
      </label>
      <div className="columns-editor" role="group" aria-label="列">
        {columns.map((c, i) => (
          <div key={i} className="column-row">
            <CommitInput
              aria-label={`列 ${i + 1} の見出し`}
              value={c.header ?? ""}
              onCommit={(v) =>
                setColumns(columns.map((x, j) => (j === i ? { ...x, header: v } : x)))
              }
            />
            <BindingInput
              aria-label={`列 ${i + 1} の値`}
              listId={rowListId}
              value={c.value ?? ""}
              onCommit={(v) =>
                setColumns(columns.map((x, j) => (j === i ? { ...x, value: v } : x)))
              }
            />
            <button
              className="link"
              aria-label={`列 ${i + 1} を削除`}
              onClick={() => setColumns(columns.filter((_, j) => j !== i))}
            >
              ×
            </button>
          </div>
        ))}
        <button onClick={() => setColumns([...columns, { header: "列", value: "{{ row.id }}" }])}>
          ＋ 列
        </button>
      </div>
    </>
  );
}
