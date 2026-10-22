import { listRecords } from "@ui-editor/poc-datastore";
import {
  applyTemplate,
  findContainer,
  KIND_LABELS,
  KINDS,
  replacedNodes,
  type ContainerRef,
  type Kind,
  type Node,
  type Project,
} from "@ui-editor/poc-model";
import { currentFrame, startAt, type RuntimeState } from "@ui-editor/poc-runtime";
import { useEffect, useMemo, useState } from "react";
import { describeAction } from "../components/actions/describe";
import { FrameView } from "../preview/PreviewPane";
import { useEditor } from "../state/store";
import { ContainerList } from "./flow/ContainerList";

/**
 * 画面ビュー（D3・FR-GEN-04）: 画面・ダイアログに役割とエンティティを設定してテンプレートを当てる。
 * 中身（ノードの木）とその画面だけのプレビューを見る。部品の編集はステップ 6。
 */
export function ScreenView() {
  const project = useEditor((s) => s.project);
  const selection = useEditor((s) => s.selection);
  const selectedId =
    selection?.kind === "container"
      ? selection.id
      : (project.screens[0]?.id ?? project.dialogs[0]?.id);
  const ref = selectedId ? findContainer(project, selectedId) : undefined;
  return (
    <div className="screen-view">
      <div className="screen-body">
        <ContainerList project={project} selected={ref?.container.id} />
        {ref ? (
          <ScreenEditor key={ref.container.id} project={project} info={ref} />
        ) : (
          <p className="placeholder muted">
            フロービューで画面・ダイアログを作ると、ここで中身を作れます。
          </p>
        )}
      </div>
    </div>
  );
}

function ScreenEditor({ project, info }: { project: Project; info: ContainerRef }) {
  const edit = useEditor((s) => s.edit);
  const requestConfirm = useEditor((s) => s.requestConfirm);
  const c = info.container;
  const [kind, setKind] = useState<Kind | "">(c.kind ?? "");
  const [entity, setEntity] = useState(c.entity ?? project.entities[0]?.id ?? "");

  const apply = () => {
    if (!kind || !entity) return;
    const run = () =>
      edit(`テンプレート（${KIND_LABELS[kind]}）を適用`, (d) =>
        applyTemplate(d, c.id, { kind, entity }),
      );
    const replaced = replacedNodes(c);
    if (replaced.length > 0)
      requestConfirm(
        `「${c.name}」の中身（仮の部品でない部品 ${replaced.length} 個: ${replaced.slice(0, 8).join("、")}${replaced.length > 8 ? " ほか" : ""}）がテンプレートで置き換わります。仮の部品（遷移）は残ります。続けますか？（元に戻すで戻せます）`,
        "置き換える",
        run,
      );
    else run();
  };

  return (
    <div className="screen-editor">
      <section className="screen-settings" aria-label="役割とエンティティ">
        <h3>
          <span className={`kind-badge kind-${info.kind}`}>
            {info.kind === "screen" ? "画面" : "ダイアログ"}
          </span>{" "}
          {c.name} <code className="muted">{c.id}</code>
        </h3>
        <div className="settings-row">
          <label>
            役割{" "}
            <select
              aria-label="役割"
              value={kind}
              onChange={(e) => setKind(e.target.value as Kind | "")}
            >
              <option value="">（選んでください）</option>
              {KINDS.map((k) => (
                <option key={k} value={k}>
                  {KIND_LABELS[k]}
                </option>
              ))}
            </select>
          </label>
          <label>
            エンティティ{" "}
            <select
              aria-label="エンティティ"
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
          <button className="primary" onClick={apply} disabled={!kind || !entity}>
            テンプレートを適用
          </button>
        </div>
        <p className="muted small">
          今の設定: {c.kind ? KIND_LABELS[c.kind] : "役割なし"}
          {c.entity ? ` / ${c.entity}` : ""}
          {project.entities.length === 0 && "（ER ビューでエンティティを作ると選べます）"}
        </p>
        {c.params && Object.keys(c.params).length > 0 && (
          <p className="small">
            パラメータ:{" "}
            {Object.entries(c.params).map(([name, def]) => (
              <code key={name} className="param-chip">
                {name}: {def.type}
                {def.entity ? `<${def.entity}>` : ""}
                {def.required ? "（必須）" : ""}
              </code>
            ))}
          </p>
        )}
      </section>
      <div className="screen-columns">
        <section className="node-outline" aria-label="中身">
          <h4>中身（ノードの木）</h4>
          {c.root ? (
            <ul>
              <Outline project={project} node={c.root} />
            </ul>
          ) : (
            <p className="muted small">
              中身がありません。役割とエンティティを選んでテンプレートを適用するか、フロー図で遷移を引いてください。
            </p>
          )}
        </section>
        <SamplePreview project={project} info={info} />
      </div>
    </div>
  );
}

function summary(node: Node): string {
  const p = node.props ?? {};
  const s =
    p.label ??
    p.text ??
    (node.type === "Table" ? p.rows : undefined) ??
    (node.type === "Box" ? p.direction : undefined);
  return typeof s === "string" ? s : "";
}

function Outline({ project, node }: { project: Project; node: Node }) {
  return (
    <li>
      <div className={`outline-row${node.placeholder ? " placeholder" : ""}`}>
        <code className="outline-type">{node.type}</code>
        <span className="outline-id">{node.id}</span>
        <span className="outline-summary">{summary(node)}</span>
        {node.placeholder && <span className="placeholder-count">仮</span>}
      </div>
      {Object.entries(node.events ?? {}).map(([event, actions]) => (
        <div key={event} className="outline-event muted small">
          {event} → {actions.map((a) => describeAction(project, a)).join(" / ")}
        </div>
      ))}
      {node.children?.length ? (
        <ul>
          {node.children.map((c) => (
            <Outline key={c.id} project={project} node={c} />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

/** その画面だけのプレビュー。レコードを使う画面は、見本のレコードを選ぶ。 */
function SamplePreview({ project, info }: { project: Project; info: ContainerRef }) {
  const c = info.container;
  const recordParam = Object.entries(c.params ?? {}).find(
    ([, d]) => d.type === "ref" && d.entity === c.entity,
  )?.[0];
  const entity = project.entities.find((e) => e.id === c.entity);
  const records = useMemo(
    () => (entity && recordParam ? listRecords(project, project.data, entity.id) : []),
    [project, entity, recordParam],
  );
  const [sample, setSample] = useState<string>(() =>
    String(records[0]?.[entity?.primaryKey ?? "id"] ?? ""),
  );
  const params = recordParam && sample ? { [recordParam]: sample } : {};
  const key = `${c.id}:${JSON.stringify(params)}`;
  const [runtime, setRuntime] = useState<RuntimeState>(() => startAt(project, c.id, params));
  // params は key にまとめて比べる（毎回作り直さないように）
  useEffect(() => setRuntime(startAt(project, c.id, params)), [project, key]);
  const frame = currentFrame(runtime);
  return (
    <section className="sample-preview" aria-label="この画面のプレビュー">
      <h4>
        この画面のプレビュー
        {entity && recordParam && (
          <select
            aria-label="見本のレコード"
            value={sample}
            onChange={(e) => setSample(e.target.value)}
          >
            <option value="">（レコードなし・作成）</option>
            {records.map((r) => {
              const id = String(r[entity.primaryKey]);
              return (
                <option key={id} value={id}>
                  {String(r[entity.displayField ?? entity.primaryKey] ?? id)}（{id}）
                </option>
              );
            })}
          </select>
        )}
        <button className="link" onClick={() => setRuntime(startAt(project, c.id, params))}>
          やり直す
        </button>
      </h4>
      <div className="sample-device">
        {frame ? (
          <FrameView
            project={project}
            runtime={runtime}
            frame={frame}
            active
            onRuntime={setRuntime}
          />
        ) : (
          <p className="muted">表示できません</p>
        )}
      </div>
    </section>
  );
}
