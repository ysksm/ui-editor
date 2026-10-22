import {
  addField,
  addRelation,
  CARDINALITIES,
  deleteEntity,
  deleteField,
  entityIdProblem,
  fieldIdProblem,
  FIELD_TYPES,
  moveField,
  nestParents,
  ON_DELETE,
  relationDataLoss,
  relationProblem,
  renameEntityId,
  renameField,
  updateEntity,
  updateField,
  walkData,
  type Entity,
  type Field,
  type FieldType,
  type Project,
  type RelationKind,
} from "@ui-editor/poc-model";
import { useState } from "react";
import { CommitInput } from "../../components/form/CommitInput";
import { generateFor } from "../../components/generate";
import { useEditor, useEditorStore } from "../../state/store";
import { RELATION_KINDS } from "./RelationDialog";

const TYPE_LABELS: Record<FieldType, string> = {
  id: "主キー",
  string: "文字列",
  number: "数値",
  boolean: "真偽",
  date: "日付",
  enum: "列挙",
  ref: "参照",
  children: "入れ子",
};
const FORMATS: Partial<Record<FieldType, readonly string[]>> = {
  string: ["email", "url", "ipv4", "phone", "multiline"],
  date: ["date", "datetime"],
};
const ON_DELETE_LABELS: Record<(typeof ON_DELETE)[number], string> = {
  restrict: "削除させない（restrict）",
  setNull: "null にする（setNull）",
  cascade: "一緒に消す（cascade）",
};

/** 選んだエンティティの編集パネル（名前・id・表示用フィールド・属性・関係）。 */
export function EntityPanel({
  entity,
  selectedField,
}: {
  entity: Entity;
  selectedField?: string | undefined;
}) {
  const project = useEditor((s) => s.project);
  const edit = useEditor((s) => s.edit);
  const select = useEditor((s) => s.select);
  const requestConfirm = useEditor((s) => s.requestConfirm);
  const id = entity.id;

  const remove = () => {
    const refs = project.entities.flatMap((e) =>
      e.id === id ? [] : e.fields.filter((f) => f.entity === id).map((f) => `${e.id}.${f.id}`),
    );
    let records = 0;
    walkData(project, ({ entity: e }) => void (e.id === id && records++));
    const detail = [
      records > 0 ? `データ ${records} 件` : "",
      refs.length > 0 ? `それを指すフィールド（${refs.join("、")}）` : "",
    ]
      .filter(Boolean)
      .join("と");
    requestConfirm(
      `エンティティ「${entity.name}」を削除しますか？${detail ? `${detail}も消えます。` : ""}`,
      "削除する",
      () => {
        if (edit("エンティティを削除", (d) => deleteEntity(d, id))) select(null);
      },
    );
  };

  return (
    <aside className="inspector" aria-label="エンティティの編集">
      <h3>{entity.name}</h3>
      <label className="row">
        <span>名前</span>
        <CommitInput
          aria-label="エンティティの名前"
          value={entity.name}
          validate={(v) => (v.trim() ? undefined : "名前を入れてください")}
          onCommit={(v) =>
            edit("エンティティの名前を変更", (d) => updateEntity(d, id, { name: v.trim() }))
          }
        />
      </label>
      <label className="row">
        <span>id</span>
        <CommitInput
          aria-label="エンティティの id"
          value={id}
          validate={(v) => entityIdProblem(project, v, id)}
          onCommit={(v) => {
            if (edit("エンティティの id を変更", (d) => renameEntityId(d, id, v)))
              select({ kind: "entity", id: v });
          }}
        />
      </label>
      <label className="row">
        <span>表示用</span>
        <select
          aria-label="表示用フィールド"
          value={entity.displayField ?? ""}
          onChange={(e) =>
            edit("表示用フィールドを変更", (d) =>
              updateEntity(d, id, { displayField: e.target.value || undefined }),
            )
          }
        >
          <option value="">（主キー）</option>
          {entity.fields
            .filter((f) => f.type !== "children" && f.id !== entity.primaryKey)
            .map((f) => (
              <option key={f.id} value={f.id}>
                {f.name ? `${f.name}（${f.id}）` : f.id}
              </option>
            ))}
        </select>
      </label>

      <h4>属性</h4>
      <ol className="field-list">
        {entity.fields.map((f, i) => (
          <FieldRow
            key={f.id}
            project={project}
            entity={entity}
            field={f}
            index={i}
            selected={selectedField === f.id}
          />
        ))}
      </ol>
      <button
        onClick={() => {
          let fieldId = "";
          if (edit("属性を追加", (d) => void (fieldId = addField(d, id))))
            select({ kind: "entity", id, field: fieldId });
        }}
      >
        ＋ 属性
      </button>

      <h4>関係</h4>
      <RelationForm project={project} from={id} />

      <h4>画面</h4>
      <ScreensFor project={project} entity={entity} />

      <hr />
      <button className="danger" onClick={remove}>
        エンティティを削除
      </button>
    </aside>
  );
}

function FieldRow({
  project,
  entity,
  field: f,
  index,
  selected,
}: {
  project: Project;
  entity: Entity;
  field: Field;
  index: number;
  selected: boolean;
}) {
  const edit = useEditor((s) => s.edit);
  const select = useEditor((s) => s.select);
  const isPk = f.id === entity.primaryKey;
  const update = (label: string, patch: Partial<Omit<Field, "id">>) =>
    edit(label, (d) => updateField(d, entity.id, f.id, patch));
  const others = project.entities.filter((e) => e.id !== entity.id);
  const parents = nestParents(project.entities);
  // 子にできるのは、ほかの親の入れ子になっていないエンティティ（今の子は選べる）
  const nestable = others.filter((e) => {
    const p = parents.get(e.id);
    return !p || (p.parent === entity.id && p.field === f.id);
  });

  return (
    <li className={`field-row${selected ? " selected" : ""}`} data-field={f.id}>
      <div className="field-main">
        <CommitInput
          aria-label={`属性 ${f.id} の id`}
          className="field-id"
          value={f.id}
          validate={(v) => fieldIdProblem(entity, v, f.id)}
          onCommit={(v) => {
            if (edit("属性の id を変更", (d) => renameField(d, entity.id, f.id, v)))
              select({ kind: "entity", id: entity.id, field: v });
          }}
        />
        <CommitInput
          aria-label={`属性 ${f.id} の名前`}
          className="field-name"
          placeholder="名前"
          value={f.name ?? ""}
          onCommit={(v) => update("属性の名前を変更", { name: v.trim() || undefined })}
        />
        <select
          aria-label={`属性 ${f.id} の型`}
          value={f.type}
          disabled={isPk}
          onChange={(e) => update("属性の型を変更", { type: e.target.value as FieldType })}
        >
          {FIELD_TYPES.filter((t) => isPk || t !== "id").map((t) => (
            <option key={t} value={t}>
              {TYPE_LABELS[t]}
            </option>
          ))}
        </select>
        {f.type === "children" || isPk ? (
          <span />
        ) : (
          <label className="inline" title="必須">
            <input
              type="checkbox"
              aria-label={`属性 ${f.id} は必須`}
              checked={f.required ?? false}
              onChange={(e) => update("必須を変更", { required: e.target.checked || undefined })}
            />
            必須
          </label>
        )}
        <span className="field-buttons">
          <button
            className="link"
            aria-label={`属性 ${f.id} を上へ`}
            disabled={index === 0}
            onClick={() => edit("属性を並べ替え", (d) => moveField(d, entity.id, f.id, index - 1))}
          >
            ↑
          </button>
          <button
            className="link"
            aria-label={`属性 ${f.id} を下へ`}
            disabled={index === entity.fields.length - 1}
            onClick={() => edit("属性を並べ替え", (d) => moveField(d, entity.id, f.id, index + 1))}
          >
            ↓
          </button>
          {!isPk && (
            <button
              className="link"
              aria-label={`属性 ${f.id} を削除`}
              onClick={() => edit("属性を削除", (d) => deleteField(d, entity.id, f.id))}
            >
              ×
            </button>
          )}
        </span>
      </div>
      <div className="field-detail">
        {f.type === "enum" && (
          <CommitInput
            aria-label={`属性 ${f.id} の値`}
            placeholder="値をカンマ区切りで"
            value={(f.values ?? []).join(", ")}
            onCommit={(v) =>
              update("列挙値を変更", {
                values: v
                  .split(/[,、]/)
                  .map((x) => x.trim())
                  .filter(Boolean),
              })
            }
          />
        )}
        {f.type === "ref" && (
          <>
            <select
              aria-label={`属性 ${f.id} の参照先`}
              value={f.entity ?? ""}
              onChange={(e) => update("参照先を変更", { entity: e.target.value || undefined })}
            >
              <option value="">（参照先）</option>
              {project.entities.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}（{e.id}）
                </option>
              ))}
            </select>
            <select
              aria-label={`属性 ${f.id} の参照先が消えたとき`}
              value={f.onDelete ?? "restrict"}
              onChange={(e) =>
                update("削除時の扱いを変更", { onDelete: e.target.value as Field["onDelete"] })
              }
            >
              {ON_DELETE.map((o) => (
                <option key={o} value={o}>
                  {ON_DELETE_LABELS[o]}
                </option>
              ))}
            </select>
          </>
        )}
        {f.type === "children" && (
          <>
            <select
              aria-label={`属性 ${f.id} の子`}
              value={f.entity ?? ""}
              onChange={(e) => update("入れ子の子を変更", { entity: e.target.value || undefined })}
            >
              <option value="">（子のエンティティ）</option>
              {nestable.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}（{e.id}）
                </option>
              ))}
            </select>
            <select
              aria-label={`属性 ${f.id} の件数`}
              value={f.cardinality ?? "many"}
              onChange={(e) =>
                update("入れ子の件数を変更", {
                  cardinality: e.target.value === "one" ? "one" : undefined,
                })
              }
            >
              {CARDINALITIES.map((c) => (
                <option key={c} value={c}>
                  {c === "many" ? "複数（配列）" : "1 件"}
                </option>
              ))}
            </select>
          </>
        )}
        {FORMATS[f.type] && (
          <select
            aria-label={`属性 ${f.id} の書式`}
            value={f.format ?? ""}
            onChange={(e) =>
              update("書式を変更", { format: (e.target.value || undefined) as Field["format"] })
            }
          >
            <option value="">（書式なし）</option>
            {FORMATS[f.type]!.map((x) => (
              <option key={x} value={x}>
                {x}
              </option>
            ))}
          </select>
        )}
        {f.type === "number" && (
          <>
            <CommitInput
              aria-label={`属性 ${f.id} の最小値`}
              className="narrow"
              placeholder="最小"
              inputMode="decimal"
              value={f.min === undefined ? "" : String(f.min)}
              validate={numberProblem}
              onCommit={(v) => update("最小値を変更", { min: v === "" ? undefined : Number(v) })}
            />
            <CommitInput
              aria-label={`属性 ${f.id} の最大値`}
              className="narrow"
              placeholder="最大"
              inputMode="decimal"
              value={f.max === undefined ? "" : String(f.max)}
              validate={numberProblem}
              onCommit={(v) => update("最大値を変更", { max: v === "" ? undefined : Number(v) })}
            />
          </>
        )}
        <DefaultInput field={f} onChange={(value) => update("既定値を変更", { default: value })} />
      </div>
    </li>
  );
}

function numberProblem(v: string): string | undefined {
  return v === "" || Number.isFinite(Number(v)) ? undefined : "数値を入れてください";
}

/** 既定値の入力（型に合わせる）。 */
function DefaultInput({
  field: f,
  onChange,
}: {
  field: Field;
  onChange: (value: Field["default"]) => void;
}) {
  const label = `属性 ${f.id} の既定値`;
  if (f.type === "boolean" || f.type === "enum") {
    const options = f.type === "boolean" ? ["true", "false"] : (f.values ?? []);
    return (
      <select
        aria-label={label}
        value={f.default === undefined || f.default === null ? "" : String(f.default)}
        onChange={(e) => {
          const v = e.target.value;
          onChange(v === "" ? undefined : f.type === "boolean" ? v === "true" : v);
        }}
      >
        <option value="">（既定値なし）</option>
        {options.map((o) => (
          <option key={o} value={o}>
            既定: {o}
          </option>
        ))}
      </select>
    );
  }
  if (f.type !== "string" && f.type !== "number" && f.type !== "date") return null;
  return (
    <CommitInput
      aria-label={label}
      className="narrow"
      placeholder="既定値"
      value={f.default === undefined || f.default === null ? "" : String(f.default)}
      validate={f.type === "number" ? numberProblem : undefined}
      onCommit={(v) => onChange(v === "" ? undefined : f.type === "number" ? Number(v) : v)}
    />
  );
}

/** パネルから関係を作る（ER 図でつなぐのと同じ。キーボードでも操作できるように）。 */
function RelationForm({ project, from }: { project: Project; from: string }) {
  const edit = useEditor((s) => s.edit);
  const select = useEditor((s) => s.select);
  const requestConfirm = useEditor((s) => s.requestConfirm);
  const others = project.entities.filter((e) => e.id !== from);
  const [to, setTo] = useState(others[0]?.id ?? "");
  const [kind, setKind] = useState<RelationKind>("one-to-many");
  const target = others.some((e) => e.id === to) ? to : (others[0]?.id ?? "");
  const problem = target
    ? relationProblem(project, from, target, kind)
    : "相手のエンティティがありません";
  const add = () => {
    const run = () => {
      let created = { entity: "", field: "" };
      if (edit("関係を追加", (d) => void (created = addRelation(d, from, target, kind))))
        select({ kind: "entity", id: created.entity, field: created.field });
    };
    const loss = relationDataLoss(project, target, kind);
    if (loss > 0)
      requestConfirm(
        `${target} のデータ ${loss} 件は消えます（親の中に移せないため）。続けますか？`,
        "続ける",
        run,
      );
    else run();
  };
  return (
    <div className="relation-form">
      <select
        aria-label="関係の種類"
        value={kind}
        onChange={(e) => setKind(e.target.value as RelationKind)}
      >
        {RELATION_KINDS.map((k) => (
          <option key={k.kind} value={k.kind}>
            {k.label}
          </option>
        ))}
      </select>
      <select aria-label="関係の相手" value={target} onChange={(e) => setTo(e.target.value)}>
        {others.map((e) => (
          <option key={e.id} value={e.id}>
            {e.name}（{e.id}）
          </option>
        ))}
      </select>
      <button onClick={add} disabled={Boolean(problem)}>
        追加
      </button>
      {problem && target && <p className="muted small">{problem}</p>}
    </div>
  );
}

/** このエンティティを扱う画面・ダイアログと、ボタン 1 つの生成（FR-GEN-01）。 */
function ScreensFor({ project, entity }: { project: Project; entity: Entity }) {
  const store = useEditorStore();
  const select = useEditor((s) => s.select);
  const setView = useEditor((s) => s.setView);
  const used = [...project.screens, ...project.dialogs].filter((c) => c.entity === entity.id);
  return (
    <div className="screens-for">
      {used.length > 0 && (
        <ul className="transition-list">
          {used.map((c) => (
            <li key={c.id}>
              <button
                className="transition-item"
                onClick={() => {
                  setView("screen");
                  select({ kind: "container", id: c.id });
                }}
              >
                <span>{c.name}</span>
                <span className="muted small">
                  {c.id}
                  {c.kind ? `・${c.kind}` : ""}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <button className="primary" onClick={() => generateFor(store, entity.id)}>
        画面を生成（一覧・詳細・編集・削除）
      </button>
    </div>
  );
}
