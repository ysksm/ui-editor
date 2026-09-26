import { useEditor } from "@craftjs/core";
import type { JsonValue, ParamDef } from "@ui-editor/schema";
import { useEffect, useState } from "react";
import { INSTANCE, ROOT_ID, type InstanceFields, type NodeFields } from "../project/convert";
import { useProject } from "../parts/view";
import { nodeLabel } from "./Layers";

/** 組み込みパーツごとの主な props（それ以外は「詳細（JSON）」で編集する）。 */
const BUILTIN_PROPS: Record<string, PropField[]> = {
  Box: [],
  Text: [
    { name: "text", kind: "text" },
    { name: "variant", kind: "select", options: ["title", "body", "caption"] },
  ],
  Button: [
    { name: "label", kind: "text" },
    { name: "variant", kind: "select", options: ["primary", "secondary", "danger"] },
    { name: "disabled", kind: "json" },
  ],
  TextInput: [
    { name: "label", kind: "text" },
    { name: "value", kind: "text" },
    { name: "placeholder", kind: "text" },
    { name: "disabled", kind: "json" },
  ],
  NumberInput: [
    { name: "label", kind: "text" },
    { name: "value", kind: "json" },
    { name: "min", kind: "json" },
    { name: "max", kind: "json" },
    { name: "step", kind: "json" },
    { name: "disabled", kind: "json" },
  ],
  Checkbox: [
    { name: "label", kind: "text" },
    { name: "checked", kind: "json" },
    { name: "disabled", kind: "json" },
  ],
  Table: [
    { name: "rows", kind: "text" },
    { name: "columns", kind: "json" },
  ],
};

interface PropField {
  name: string;
  /** text: 文字列のまま / json: 数値・真偽値・配列などは JSON として読む / select: 候補から選ぶ */
  kind: "text" | "json" | "select";
  options?: string[];
}

function instanceFields(defs: Record<string, ParamDef> | undefined): PropField[] {
  return Object.entries(defs ?? {}).map(([name, def]) => ({
    name,
    kind: def.type.trim() === "string" ? "text" : "json",
  }));
}

/** 選択中のノードのプロパティ。 */
export function PropsPanel() {
  const project = useProject();
  const { selectedId, node, actions, query } = useEditor((state) => {
    const id = [...state.events.selected][0];
    return { selectedId: id, node: id ? state.nodes[id] : undefined };
  });

  if (!selectedId || !node) {
    return <p className="panel-empty">キャンバスかレイヤーでノードを選択してください</p>;
  }

  const fields = node.data.props as InstanceFields;
  const { type } = nodeLabel(node);
  const propFields =
    node.data.name === INSTANCE
      ? instanceFields(project.components?.find((c) => c.id === fields.component)?.props)
      : (BUILTIN_PROPS[type] ?? []);

  const set = (update: (f: NodeFields) => void) => actions.setProp(selectedId, update);
  const setProp = (name: string, value: JsonValue | undefined) =>
    set((f) => {
      const props = { ...f.props };
      if (value === undefined) delete props[name];
      else props[name] = value;
      f.props = Object.keys(props).length > 0 ? props : undefined;
    });

  const parentId = node.data.parent;
  const siblings = parentId ? (query.node(parentId).get().data.nodes ?? []) : [];
  const index = siblings.indexOf(selectedId);
  const move = (delta: number) => {
    if (!parentId) return;
    // move の index は「取り除く前」の並びでの挿入位置
    actions.move(selectedId, parentId, delta > 0 ? index + 2 : index - 1);
  };

  return (
    <div className="props-panel">
      <div className="panel-row">
        <strong>{type}</strong>
        <span className="panel-actions">
          <button
            type="button"
            disabled={!parentId}
            onClick={() => parentId && actions.selectNode(parentId)}
          >
            親へ
          </button>
          <button type="button" disabled={!parentId || index <= 0} onClick={() => move(-1)}>
            ↑
          </button>
          <button
            type="button"
            disabled={!parentId || index >= siblings.length - 1}
            onClick={() => move(1)}
          >
            ↓
          </button>
          <button
            type="button"
            disabled={selectedId === ROOT_ID}
            onClick={() => {
              actions.delete(selectedId);
              actions.selectNode(parentId ?? undefined);
            }}
          >
            削除
          </button>
        </span>
      </div>

      <label className="field">
        <span>id</span>
        <TextField
          value={fields.nodeId ?? ""}
          onCommit={(v) => set((f) => (f.nodeId = v || undefined))}
        />
      </label>

      {propFields.length > 0 && <div className="panel-subtitle">props</div>}
      {propFields.map((pf) => (
        <label className="field" key={pf.name}>
          <span>{pf.name}</span>
          {pf.kind === "select" ? (
            <select
              value={
                typeof fields.props?.[pf.name] === "string" ? String(fields.props[pf.name]) : ""
              }
              onChange={(e) => setProp(pf.name, e.target.value || undefined)}
            >
              <option value="">（未指定）</option>
              {pf.options?.map((o) => (
                <option key={o}>{o}</option>
              ))}
            </select>
          ) : pf.kind === "text" ? (
            <TextField
              value={toText(fields.props?.[pf.name], "text")}
              onCommit={(v) => setProp(pf.name, v === "" ? undefined : v)}
              multiline={pf.name === "text"}
            />
          ) : (
            <TextField
              value={toText(fields.props?.[pf.name], "json")}
              onCommit={(v) => setProp(pf.name, v === "" ? undefined : parseLoose(v))}
              multiline={pf.name === "columns"}
            />
          )}
        </label>
      ))}

      <details className="json-details">
        <summary>詳細（JSON）: props / repeat / visible / events</summary>
        <JsonField
          label="props"
          value={fields.props}
          onCommit={(v) => set((f) => (f.props = v as NodeFields["props"]))}
        />
        <JsonField
          label="repeat"
          value={fields.repeat}
          onCommit={(v) => set((f) => (f.repeat = v as NodeFields["repeat"]))}
        />
        <JsonField
          label="visible"
          value={fields.visible}
          onCommit={(v) => set((f) => (f.visible = v as NodeFields["visible"]))}
        />
        <JsonField
          label="events"
          value={fields.events}
          onCommit={(v) => set((f) => (f.events = v as NodeFields["events"]))}
        />
      </details>
    </div>
  );
}

function toText(value: JsonValue | undefined, kind: "text" | "json"): string {
  if (value === undefined) return "";
  if (kind === "text" && typeof value === "string") return value;
  return JSON.stringify(value, null, kind === "json" && typeof value === "object" ? 2 : 0);
}

/** JSON として読めれば JSON、読めなければ文字列（`{{ 式 }}` など）。 */
export function parseLoose(text: string): JsonValue {
  try {
    return JSON.parse(text) as JsonValue;
  } catch {
    return text;
  }
}

/** 入力中は手元に持ち、確定（blur / Enter）したときだけ反映する。 */
export function TextField({
  value,
  onCommit,
  multiline = false,
  placeholder,
}: {
  value: string;
  onCommit: (value: string) => void;
  multiline?: boolean;
  placeholder?: string;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const commit = () => {
    if (draft !== value) onCommit(draft);
  };
  if (multiline) {
    return (
      <textarea
        value={draft}
        placeholder={placeholder}
        rows={Math.min(8, Math.max(2, draft.split("\n").length))}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
      />
    );
  }
  return (
    <input
      value={draft}
      placeholder={placeholder}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") commit();
      }}
    />
  );
}

function JsonField({
  label,
  value,
  onCommit,
}: {
  label: string;
  value: unknown;
  onCommit: (value: unknown) => void;
}) {
  const text = value === undefined ? "" : JSON.stringify(value, null, 2);
  const [error, setError] = useState<string>();
  return (
    <label className="field">
      <span>{label}</span>
      <TextField
        value={text}
        multiline
        placeholder="（なし）"
        onCommit={(v) => {
          if (v.trim() === "") {
            setError(undefined);
            onCommit(undefined);
            return;
          }
          try {
            onCommit(JSON.parse(v));
            setError(undefined);
          } catch (e) {
            setError((e as Error).message);
          }
        }}
      />
      {error && <span className="field-error">{error}</span>}
    </label>
  );
}
