import type { JsonValue, ParamDef } from "@ui-editor/schema";
import { useState } from "react";
import {
  addDoc,
  checkNewDocId,
  DOC_KIND_LABEL,
  getDocMeta,
  setDocMeta,
  type DocKind,
  type DocMeta,
} from "../project/documents";
import { parseLoose, TextField } from "./PropsPanel";
import { useWorkspace } from "./workspace";

/** 画面・コンポーネント・ダイアログを新しく作る。 */
export function NewDocForm() {
  const { project, updateProject, openDoc } = useWorkspace();
  const [kind, setKind] = useState<DocKind>("component");
  const [id, setId] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string>();

  const create = () => {
    const problem = checkNewDocId(project, kind, id.trim());
    if (problem) {
      setError(problem);
      return;
    }
    const next = addDoc(project, kind, id.trim(), name.trim() || id.trim());
    updateProject(() => next);
    openDoc({ kind, id: id.trim() }, next);
    setId("");
    setName("");
    setError(undefined);
  };

  return (
    <div className="new-doc">
      <select
        aria-label="作る種類"
        value={kind}
        onChange={(e) => setKind(e.target.value as DocKind)}
      >
        {(["screen", "component", "dialog"] as const).map((k) => (
          <option key={k} value={k}>
            {DOC_KIND_LABEL[k]}
          </option>
        ))}
      </select>
      <input
        aria-label="新しい id"
        placeholder={kind === "component" ? "id（例: KpiCard）" : "id（例: settings）"}
        value={id}
        onChange={(e) => setId(e.target.value)}
      />
      <input
        aria-label="新しい名前"
        placeholder="名前"
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      <button type="button" onClick={create}>
        作成
      </button>
      {error && <span className="field-error">{error}</span>}
    </div>
  );
}

/** 開いているドキュメントの設定（名前・パス・params / props の定義）。 */
export function DocSettings() {
  const { project, docKey, updateProject } = useWorkspace();
  const meta = getDocMeta(project, docKey);
  if (!meta) return null;
  const set = (patch: Partial<DocMeta>) =>
    updateProject((p) => {
      const current = getDocMeta(p, docKey);
      return current ? setDocMeta(p, docKey, { ...current, ...patch }) : p;
    });
  return (
    <div className="doc-settings">
      <div className="panel-row">
        <strong>
          {DOC_KIND_LABEL[docKey.kind]}: {docKey.id}
        </strong>
      </div>
      <label className="field">
        <span>名前</span>
        <TextField value={meta.name} onCommit={(v) => set({ name: v })} />
      </label>
      {meta.path !== undefined && (
        <label className="field">
          <span>パス</span>
          <TextField value={meta.path} onCommit={(v) => set({ path: v })} />
        </label>
      )}
      <div className="panel-subtitle">
        {docKey.kind === "component" ? "props（{{ props.xxx }}）" : "params（{{ params.xxx }}）"}
      </div>
      <ParamDefsEditor value={meta.params} onChange={(params) => set({ params })} />
    </div>
  );
}

const PARAM_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;

/** 引数の定義（名前・TS の型・既定値）の編集。 */
export function ParamDefsEditor({
  value,
  onChange,
}: {
  value: Record<string, ParamDef>;
  onChange: (value: Record<string, ParamDef>) => void;
}) {
  const [name, setName] = useState("");
  const [type, setType] = useState("string");
  const [error, setError] = useState<string>();

  const update = (key: string, def: ParamDef | undefined) => {
    const next = { ...value };
    if (def) next[key] = def;
    else delete next[key];
    onChange(next);
  };

  const add = () => {
    const n = name.trim();
    if (!PARAM_NAME.test(n)) return setError("名前は英字・数字・_ で指定してください");
    if (n in value) return setError(`${n} は既にあります`);
    if (type.trim() === "") return setError("型を指定してください");
    update(n, { type: type.trim() });
    setName("");
    setError(undefined);
  };

  return (
    <div className="param-defs">
      {Object.entries(value).map(([key, def]) => (
        <div className="param-row" key={key}>
          <code>{key}</code>
          <TextField value={def.type} onCommit={(t) => t && update(key, { ...def, type: t })} />
          <TextField
            value={def.default === undefined ? "" : toText(def.default)}
            placeholder="既定値（なし＝必須）"
            onCommit={(v) => {
              const next: ParamDef = { ...def };
              if (v === "") delete next.default;
              else next.default = parseLoose(v);
              update(key, next);
            }}
          />
          <button type="button" aria-label={`${key} を削除`} onClick={() => update(key, undefined)}>
            ×
          </button>
        </div>
      ))}
      <div className="param-row param-row--new">
        <input
          aria-label="追加する名前"
          placeholder="名前"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <input
          aria-label="追加する型"
          placeholder="型"
          value={type}
          onChange={(e) => setType(e.target.value)}
        />
        <button type="button" onClick={add}>
          追加
        </button>
      </div>
      {error && <span className="field-error">{error}</span>}
    </div>
  );
}

function toText(v: JsonValue): string {
  return typeof v === "string" ? v : JSON.stringify(v);
}
