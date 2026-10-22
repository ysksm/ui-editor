import {
  containers,
  deleteTransition,
  findContainer,
  listAt,
  retargetTransition,
  setTransitionActions,
  setTransitionParams,
  setTrigger,
  triggerKind,
  updateNodeProps,
  walkNodes,
  type Node,
  type Params,
  type Project,
  type Transition,
  type TriggerSpec,
} from "@ui-editor/poc-model";
import { useState } from "react";
import { ActionListEditor } from "../../components/actions/ActionListEditor";
import { CommitInput } from "../../components/form/CommitInput";
import { useEditor } from "../../state/store";
import { triggerLabel } from "./graph";

const TRIGGERS: { kind: TriggerSpec["kind"]; label: string; note: string }[] = [
  { kind: "button", label: "ボタン（T1）", note: "ボタンを押すと遷移する" },
  {
    kind: "rowClick",
    label: "行クリック（T2）",
    note: "表の行を押すと、その行の値を渡して遷移する",
  },
  {
    kind: "selectButton",
    label: "選択＋ボタン（T3）",
    note: "表で行を選んでからボタン。未選択ならボタンは押せない",
  },
  {
    kind: "mount",
    label: "画面を開いたとき（T5）",
    note: "画面を開いたら遷移する（when で条件を付けられる）",
  },
];
const NEW = "";

/** 選んだ遷移のパネル（FR-FLOW-04）: 遷移先・トリガー・渡す値・付随アクション。 */
export function TransitionPanel({
  project,
  transition: t,
}: {
  project: Project;
  transition: Transition;
}) {
  const edit = useEditor((s) => s.edit);
  const select = useEditor((s) => s.select);
  const all = containers(project);
  const name = (id: string) => all.find((c) => c.container.id === id)?.container.name ?? id;
  const target = findContainer(project, t.to);
  const from = findContainer(project, t.from);
  const node = t.node ? findNodeIn(from?.container.root, t.node) : undefined;
  const actions = listAt(project, t);
  const reselect = (key: string | undefined) => select(key ? { kind: "transition", key } : null);

  return (
    <aside className="inspector" aria-label="遷移の編集">
      <h3>
        <span className={`kind-badge ${t.kind === "openDialog" ? "kind-dialog" : "kind-screen"}`}>
          {t.kind === "openDialog" ? "呼び出し" : "遷移"}
        </span>{" "}
        {name(t.from)} → {name(t.to)}
      </h3>

      <label className="row">
        <span>遷移先</span>
        <select
          aria-label="遷移先"
          value={t.to}
          onChange={(e) =>
            edit("遷移先を変更", (d) => retargetTransition(d, t.key, e.target.value))
          }
        >
          {all.map((c) => (
            <option key={c.container.id} value={c.container.id}>
              {c.kind === "screen" ? "画面" : "ダイアログ"}: {c.container.name}
            </option>
          ))}
        </select>
      </label>

      <h4>トリガー</h4>
      <p className="trigger-now">
        {triggerLabel(t)}
        {t.placeholder && <span className="placeholder-count">仮の部品</span>}
      </p>
      {node?.type === "Button" && (
        <label className="row">
          <span>文言</span>
          <CommitInput
            aria-label="ボタンの文言"
            value={typeof node.props?.label === "string" ? node.props.label : ""}
            onCommit={(v) =>
              edit("ボタンの文言を変更", (d) =>
                updateNodeProps(d, t.from, node.id, { label: v || undefined }),
              )
            }
          />
        </label>
      )}
      {t.onClose ? (
        <p className="muted small">
          ダイアログ「{name(t.onClose.dialog)}」を閉じた結果（{t.onClose.result}
          ）で動く遷移です。トリガーは openDialog の onClose で決まります。
        </p>
      ) : (
        <TriggerForm
          project={project}
          transition={t}
          onApply={(spec) => {
            let key = "";
            if (edit("トリガーを変更", (d) => void (key = setTrigger(d, t.key, spec))))
              reselect(key);
          }}
        />
      )}

      <h4>渡す値</h4>
      <ParamsForm
        project={project}
        transition={t}
        onChange={(params) => edit("渡す値を変更", (d) => setTransitionParams(d, t.key, params))}
      />
      {target && !Object.keys(target.container.params ?? {}).length && !t.params && (
        <p className="muted small">遷移先「{target.container.name}」にパラメータはありません。</p>
      )}

      <h4>付随アクション</h4>
      <p className="muted small">
        同じトリガーで、遷移の前後に順に実行するアクション（例: 削除してから一覧へ）。
      </p>
      <ActionListEditor
        project={project}
        label="付随アクション"
        actions={actions}
        highlight={Number(t.path.at(-1))}
        onChange={(next) => {
          let key: string | undefined;
          if (
            edit("付随アクションを変更", (d) => void (key = setTransitionActions(d, t.key, next)))
          )
            reselect(key);
        }}
      />

      <hr />
      <button
        className="danger"
        onClick={() => {
          if (edit("遷移を削除", (d) => deleteTransition(d, t.key))) select(null);
        }}
      >
        遷移を削除
      </button>
    </aside>
  );
}

function findNodeIn(root: Node | undefined, id: string): Node | undefined {
  let found: Node | undefined;
  if (root) walkNodes(root, [], (n) => (found ??= n.id === id ? n : undefined));
  return found;
}

function nodesOf(root: Node | undefined, type: string): Node[] {
  const out: Node[] = [];
  if (root) walkNodes(root, [], (n) => n.type === type && out.push(n));
  return out;
}

const nodeLabel = (n: Node) => {
  const text = n.props?.label ?? n.props?.text;
  return `${typeof text === "string" ? `${text}（${n.id}）` : n.id}${n.placeholder ? "・仮" : ""}`;
};

/** トリガーの種類と部品を選んで変える。 */
function TriggerForm({
  project,
  transition: t,
  onApply,
}: {
  project: Project;
  transition: Transition;
  onApply: (spec: TriggerSpec) => void;
}) {
  const from = findContainer(project, t.from);
  const current = triggerKind(project, t);
  const [kind, setKind] = useState<TriggerSpec["kind"]>(current);
  const buttons = nodesOf(from?.container.root, "Button");
  const tables = nodesOf(from?.container.root, "Table");
  const targetEntity = findContainer(project, t.to)?.container.entity;
  const defaultEntity = targetEntity ?? from?.container.entity ?? project.entities[0]?.id ?? "";
  const [button, setButton] = useState(t.nodeType === "Button" ? (t.node ?? NEW) : NEW);
  const [table, setTable] = useState(tables[0]?.id ?? NEW);
  const [entity, setEntity] = useState(defaultEntity);
  const kinds = TRIGGERS.filter((k) => k.kind !== "mount" || from?.kind === "screen");
  const needsEntity = (kind === "rowClick" && table === NEW) || kind === "selectButton";

  const spec = (): TriggerSpec => {
    switch (kind) {
      case "button":
        return { kind, node: button || undefined };
      case "rowClick":
        return { kind, node: table || undefined, entity: entity || undefined };
      case "selectButton":
        return { kind, node: button || undefined, table: table || undefined, entity };
      case "mount":
        return { kind };
    }
  };

  return (
    <div className="trigger-form">
      <div role="radiogroup" aria-label="トリガーの種類" className="trigger-kinds">
        {kinds.map((k) => (
          <label key={k.kind} className="inline" title={k.note}>
            <input
              type="radio"
              name="trigger-kind"
              checked={kind === k.kind}
              onChange={() => setKind(k.kind)}
            />
            {k.label}
          </label>
        ))}
      </div>
      {(kind === "rowClick" || kind === "selectButton") && (
        <label className="row">
          <span>表</span>
          <select
            aria-label="トリガーの表"
            value={table}
            onChange={(e) => setTable(e.target.value)}
          >
            {tables.map((n) => (
              <option key={n.id} value={n.id}>
                {nodeLabel(n)}
              </option>
            ))}
            <option value={NEW}>（新しい仮の表）</option>
          </select>
        </label>
      )}
      {needsEntity && (
        <label className="row">
          <span>{kind === "selectButton" ? "選ぶもの" : "表の中身"}</span>
          <select
            aria-label="トリガーのエンティティ"
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
      )}
      {(kind === "button" || kind === "selectButton") && (
        <label className="row">
          <span>ボタン</span>
          <select
            aria-label="トリガーのボタン"
            value={button}
            onChange={(e) => setButton(e.target.value)}
          >
            {buttons.map((n) => (
              <option key={n.id} value={n.id}>
                {nodeLabel(n)}
              </option>
            ))}
            <option value={NEW}>（新しい仮のボタン）</option>
          </select>
        </label>
      )}
      <button onClick={() => onApply(spec())} disabled={needsEntity && !entity}>
        トリガーを変更
      </button>
    </div>
  );
}

/** 渡す値: 遷移先のパラメータごとに式を入れる。空にすると消す。 */
function ParamsForm({
  project,
  transition: t,
  onChange,
}: {
  project: Project;
  transition: Transition;
  onChange: (params: Params | undefined) => void;
}) {
  const defs = findContainer(project, t.to)?.container.params ?? {};
  const names = [...new Set([...Object.keys(defs), ...Object.keys(t.params ?? {})])];
  if (names.length === 0) return null;
  const set = (name: string, value: string) => {
    const next: Params = { ...t.params };
    if (value === "") delete next[name];
    else next[name] = value;
    onChange(next);
  };
  return (
    <div className="params-form">
      {names.map((name) => {
        const def = defs[name];
        const v = t.params?.[name];
        return (
          <label key={name} className="row param-row">
            <span>
              {name}
              {def?.required && <span className="required">*</span>}
            </span>
            <CommitInput
              aria-label={`渡す値 ${name}`}
              placeholder={
                def ? `${def.type}${def.entity ? `（${def.entity}）` : ""}` : "定義に無いパラメータ"
              }
              value={v === undefined ? "" : typeof v === "string" ? v : JSON.stringify(v)}
              onCommit={(value) => set(name, value)}
            />
          </label>
        );
      })}
    </div>
  );
}
