import {
  formatType,
  isModelDecl,
  parseDataModel,
  type FieldDef,
  type TypeDecl,
  type TypeRef,
} from "@ui-editor/runtime";
import { useMemo, useState } from "react";
import * as edit from "./edit";

interface Props {
  source: string;
  onChange: (source: string) => void;
}

type Mode = "view" | "form" | "source";

/** データモデル（`dataModel.source`）の一覧・詳細と、簡易スキーマ定義 UI。 */
export function DataModelView({ source, onChange }: Props) {
  const parsed = useMemo(() => parseDataModel(source), [source]);
  const models = parsed.declarations.filter(isModelDecl);
  const aliases = parsed.declarations.filter((d) => !isModelDecl(d));
  const [selected, setSelected] = useState<string | undefined>(models[0]?.name);
  const [mode, setMode] = useState<Mode>("view");
  const current = parsed.declarations.find((d) => d.name === selected) ?? models[0];

  const apply = (decls: TypeDecl[]) => onChange(edit.printDataModel(decls));

  return (
    <div className="split">
      <aside className="sidebar">
        <h3>データモデル（{models.length}）</h3>
        <ul className="list">
          {models.map((d) => (
            <li key={d.name}>
              <button
                className={d === current ? "list-item active" : "list-item"}
                onClick={() => setSelected(d.name)}
              >
                <span>{d.name}</span>
                <span className="muted">
                  {d.type.kind === "object" ? d.type.fields.length : 0} 項目
                </span>
              </button>
            </li>
          ))}
        </ul>
        <h3>型（{aliases.length}）</h3>
        <ul className="list">
          {aliases.map((d) => (
            <li key={d.name}>
              <button
                className={d === current ? "list-item active" : "list-item"}
                onClick={() => setSelected(d.name)}
              >
                <span>{d.name}</span>
                <span className="muted">{kindLabel(d.type)}</span>
              </button>
            </li>
          ))}
        </ul>
        <button
          className="button"
          onClick={() => {
            const { decls, name } = edit.addModel(parsed.declarations);
            apply(decls);
            setSelected(name);
            setMode("form");
          }}
        >
          ＋ モデルを追加
        </button>
      </aside>

      <section className="main">
        <div className="toolbar">
          <div className="tabs">
            {(["view", "form", "source"] as const).map((m) => (
              <button
                key={m}
                className={mode === m ? "tab active" : "tab"}
                onClick={() => setMode(m)}
              >
                {{ view: "詳細", form: "フォームで編集", source: "TS ソース" }[m]}
              </button>
            ))}
          </div>
        </div>

        {parsed.diagnostics.length > 0 && (
          <ul className="diagnostics">
            {parsed.diagnostics.map((d, i) => (
              <li key={i}>
                {d.line !== undefined && <span className="muted">{d.line} 行目: </span>}
                {d.declaration && <strong>{d.declaration}: </strong>}
                {d.message}
              </li>
            ))}
          </ul>
        )}

        {mode === "source" ? (
          <textarea
            className="source"
            spellCheck={false}
            value={source}
            onChange={(e) => onChange(e.target.value)}
          />
        ) : !current ? (
          <p className="muted">型がありません</p>
        ) : mode === "view" ? (
          <DeclDetail decl={current} onSelect={setSelected} />
        ) : (
          <DeclForm
            key={current.name}
            decl={current}
            decls={parsed.declarations}
            apply={apply}
            onRenamed={setSelected}
          />
        )}
      </section>
    </div>
  );
}

function kindLabel(type: TypeRef): string {
  if (type.kind === "union" && type.types.every((t) => t.kind === "literal")) return "列挙";
  return type.kind === "union" ? "ユニオン" : formatType(type);
}

// ---- 詳細（閲覧） ----

function DeclDetail({ decl, onSelect }: { decl: TypeDecl; onSelect: (name: string) => void }) {
  return (
    <div className="detail">
      <h2>
        {decl.name} <span className="muted small">{decl.declaration}</span>
      </h2>
      {decl.description && <p>{decl.description}</p>}
      {decl.type.kind === "object" ? (
        <table className="table">
          <thead>
            <tr>
              <th>フィールド</th>
              <th>型</th>
              <th>必須</th>
              <th>説明</th>
            </tr>
          </thead>
          <tbody>
            <FieldRows fields={decl.type.fields} depth={0} onSelect={onSelect} />
          </tbody>
        </table>
      ) : (
        <>
          <pre className="code">{formatType(decl.type)}</pre>
          {decl.type.kind === "union" && decl.type.types.every((t) => t.kind === "literal") && (
            <ul>
              {decl.type.types.map((t, i) => (
                <li key={i}>
                  <code>{formatType(t)}</code>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}

function FieldRows(props: { fields: FieldDef[]; depth: number; onSelect: (name: string) => void }) {
  return props.fields.map((f) => (
    <FieldRow key={f.name} field={f} depth={props.depth} onSelect={props.onSelect} />
  ));
}

function FieldRow({
  field,
  depth,
  onSelect,
}: {
  field: FieldDef;
  depth: number;
  onSelect: (name: string) => void;
}) {
  const nested = field.type.kind === "object" ? field.type.fields : undefined;
  return (
    <>
      <tr>
        <td style={{ paddingLeft: 8 + depth * 20 }}>
          <code>{field.name}</code>
        </td>
        <td>
          {nested ? (
            <span className="muted">object</span>
          ) : (
            <TypeView type={field.type} onSelect={onSelect} />
          )}
        </td>
        <td>{field.optional ? "" : "✓"}</td>
        <td className="muted">{field.description}</td>
      </tr>
      {nested && <FieldRows fields={nested} depth={depth + 1} onSelect={onSelect} />}
    </>
  );
}

/** 型を表示する。宣言済みの型名はクリックでその型へ移動する。 */
function TypeView({ type, onSelect }: { type: TypeRef; onSelect: (name: string) => void }) {
  switch (type.kind) {
    case "ref":
      return (
        <button className="link" onClick={() => onSelect(type.name)}>
          {type.name}
        </button>
      );
    case "array":
      return (
        <>
          <TypeView type={type.element} onSelect={onSelect} />
          []
        </>
      );
    case "union":
      return type.types.map((t, i) => (
        <span key={i}>
          {i > 0 && " | "}
          <TypeView type={t} onSelect={onSelect} />
        </span>
      ));
    default:
      return <code>{formatType(type)}</code>;
  }
}

// ---- フォームで編集（簡易スキーマ定義 UI） ----

function DeclForm(props: {
  decl: TypeDecl;
  decls: TypeDecl[];
  apply: (decls: TypeDecl[]) => void;
  onRenamed: (name: string) => void;
}) {
  const { decl, decls, apply } = props;
  const [name, setName] = useState(decl.name);
  const fields = decl.type.kind === "object" ? decl.type.fields : undefined;

  const commitName = () => {
    const next = name.trim();
    if (next === decl.name) return;
    if (!/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(next) || decls.some((d) => d.name === next)) {
      setName(decl.name);
      return;
    }
    apply(edit.renameDecl(decls, decl.name, next));
    props.onRenamed(next);
  };

  return (
    <div className="detail">
      <div className="form-row">
        <label>
          名前
          <input value={name} onChange={(e) => setName(e.target.value)} onBlur={commitName} />
        </label>
        <label className="grow">
          説明
          <input
            value={decl.description ?? ""}
            onChange={(e) => apply(edit.setDeclDescription(decls, decl.name, e.target.value))}
          />
        </label>
        <button className="button danger" onClick={() => apply(edit.removeDecl(decls, decl.name))}>
          削除
        </button>
      </div>
      {!fields ? (
        <p className="muted">
          オブジェクト型以外（{formatType(decl.type)}）は「TS ソース」で編集してください。
        </p>
      ) : (
        <>
          <table className="table">
            <thead>
              <tr>
                <th>フィールド</th>
                <th>型（TS の型式）</th>
                <th>必須</th>
                <th>説明</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {fields.map((f, i) => (
                <FieldFormRow
                  // 名前の入力中にフォーカスが外れないよう、key に名前は含めない
                  key={`${i}:${formatType(f.type)}`}
                  field={f}
                  update={(patch) => apply(edit.updateField(decls, decl.name, i, patch))}
                  move={(delta) => apply(edit.moveField(decls, decl.name, i, delta))}
                  remove={() => apply(edit.removeField(decls, decl.name, i))}
                />
              ))}
            </tbody>
          </table>
          <button className="button" onClick={() => apply(edit.addField(decls, decl.name))}>
            ＋ フィールドを追加
          </button>
        </>
      )}
      <h3>出力される TS</h3>
      <pre className="code">{edit.printDataModel([decl])}</pre>
    </div>
  );
}

function FieldFormRow(props: {
  field: FieldDef;
  update: (patch: edit.FieldPatch) => void;
  move: (delta: -1 | 1) => void;
  remove: () => void;
}) {
  const { field, update } = props;
  // 型は入力途中で解釈できないことが多いので、確定（blur）時に反映する
  const [typeText, setTypeText] = useState(formatType(field.type));
  const invalid = field.type.kind === "unsupported";
  return (
    <tr>
      <td>
        <input value={field.name} onChange={(e) => update({ name: e.target.value })} />
      </td>
      <td>
        <input
          className={invalid ? "invalid mono" : "mono"}
          value={typeText}
          onChange={(e) => setTypeText(e.target.value)}
          onBlur={() => update({ typeText })}
        />
      </td>
      <td>
        <input
          type="checkbox"
          checked={!field.optional}
          onChange={(e) => update({ optional: !e.target.checked })}
        />
      </td>
      <td>
        <input
          value={field.description ?? ""}
          onChange={(e) => update({ description: e.target.value })}
        />
      </td>
      <td className="nowrap">
        <button className="icon" title="上へ" onClick={() => props.move(-1)}>
          ↑
        </button>
        <button className="icon" title="下へ" onClick={() => props.move(1)}>
          ↓
        </button>
        <button className="icon" title="削除" onClick={props.remove}>
          ×
        </button>
      </td>
    </tr>
  );
}
