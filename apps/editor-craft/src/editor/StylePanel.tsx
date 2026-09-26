import { useEditor } from "@craftjs/core";
import { StyleSchema, type Style } from "@ui-editor/schema";
import { useEffect, useState } from "react";
import type { NodeFields } from "../project/convert";

type StyleKey = keyof Style;

/**
 * length: 数値なら px、それ以外は文字列のまま（`50%`, `4px 8px` など）
 * number: 数値のみ / enum: スキーマの候補から選ぶ / text: 文字列（`{{ }}` 可）
 */
type Kind = "length" | "number" | "enum" | "text";

interface StyleField {
  key: StyleKey;
  label: string;
  kind: Kind;
}

const GROUPS: { title: string; fields: StyleField[]; flexOnly?: boolean }[] = [
  {
    title: "サイズ",
    fields: [
      { key: "width", label: "幅", kind: "length" },
      { key: "height", label: "高さ", kind: "length" },
      { key: "minWidth", label: "最小幅", kind: "length" },
      { key: "maxWidth", label: "最大幅", kind: "length" },
      { key: "minHeight", label: "最小高さ", kind: "length" },
      { key: "maxHeight", label: "最大高さ", kind: "length" },
    ],
  },
  {
    title: "余白",
    fields: [
      { key: "padding", label: "padding", kind: "length" },
      { key: "margin", label: "margin", kind: "length" },
    ],
  },
  {
    title: "レイアウト（flex コンテナ）",
    fields: [
      { key: "display", label: "display", kind: "enum" },
      { key: "flexDirection", label: "方向", kind: "enum" },
      { key: "flexWrap", label: "折り返し", kind: "enum" },
      { key: "justifyContent", label: "主軸の揃え", kind: "enum" },
      { key: "alignItems", label: "交差軸の揃え", kind: "enum" },
      { key: "gap", label: "gap", kind: "length" },
    ],
  },
  {
    title: "flex の子として",
    fields: [
      { key: "flex", label: "flex", kind: "length" },
      { key: "flexGrow", label: "grow", kind: "number" },
      { key: "flexShrink", label: "shrink", kind: "number" },
    ],
  },
  {
    title: "見た目",
    fields: [
      { key: "color", label: "文字色", kind: "text" },
      { key: "backgroundColor", label: "背景色", kind: "text" },
      { key: "border", label: "border", kind: "text" },
      { key: "borderRadius", label: "角丸", kind: "length" },
      { key: "fontSize", label: "文字サイズ", kind: "length" },
      { key: "fontWeight", label: "太さ", kind: "length" },
      { key: "textAlign", label: "文字揃え", kind: "enum" },
      { key: "overflow", label: "overflow", kind: "enum" },
      { key: "cursor", label: "cursor", kind: "enum" },
    ],
  },
];

/** enum の候補はスキーマ（zod）から取る。 */
function enumOptions(key: StyleKey): readonly string[] {
  const schema = StyleSchema.shape[key].unwrap() as { options?: readonly string[] };
  return schema.options ?? [];
}

/** 入力文字列 → スタイルの値。空なら undefined（キーを消す）。 */
export function parseStyleValue(kind: Kind, text: string): string | number | undefined {
  const t = text.trim();
  if (t === "") return undefined;
  if (kind === "text" || kind === "enum") return t;
  const n = Number(t);
  if (Number.isFinite(n)) return n;
  return kind === "number" ? undefined : t;
}

/** style を更新する。空になったキー・空の style は取り除く（P0 に `{}` を残さない）。 */
export function updateStyle(
  style: Style | undefined,
  key: StyleKey,
  value: string | number | undefined,
): Style | undefined {
  const next: Record<string, unknown> = { ...style };
  if (value === undefined) delete next[key];
  else next[key] = value;
  return Object.keys(next).length > 0 ? (next as Style) : undefined;
}

/** 選択中のノードの style。入力するたびにキャンバスへ反映する。 */
export function StylePanel({ nodeId }: { nodeId: string }) {
  const { style, actions } = useEditor((state) => ({
    style: (state.nodes[nodeId]?.data.props as NodeFields | undefined)?.style,
  }));

  const setStyle = (key: StyleKey, value: string | number | undefined) =>
    // 連続した入力は 1 つの履歴にまとめる
    actions.history.throttle(500).setProp(nodeId, (f: NodeFields) => {
      f.style = updateStyle(f.style, key, value);
    });

  const isFlex = style?.display === "flex" || style?.display === "inline-flex";

  return (
    <div className="style-panel">
      {GROUPS.map((group) => (
        <fieldset key={group.title} className="style-group">
          <legend>{group.title}</legend>
          {group.title.startsWith("レイアウト") && (
            <div className="style-presets">
              <button
                type="button"
                onClick={() => {
                  setStyle("display", "flex");
                  setStyle("flexDirection", "row");
                }}
              >
                横並び
              </button>
              <button
                type="button"
                onClick={() => {
                  setStyle("display", "flex");
                  setStyle("flexDirection", "column");
                }}
              >
                縦並び
              </button>
              {!isFlex && <span className="style-hint">display: flex のときに効く</span>}
            </div>
          )}
          <div className="style-grid">
            {group.fields.map((f) => (
              <label key={f.key} className="field">
                <span>{f.label}</span>
                {f.kind === "enum" ? (
                  <select
                    aria-label={f.key}
                    value={String(style?.[f.key] ?? "")}
                    onChange={(e) => setStyle(f.key, e.target.value || undefined)}
                  >
                    <option value="">—</option>
                    {enumOptions(f.key).map((o) => (
                      <option key={o}>{o}</option>
                    ))}
                  </select>
                ) : (
                  <StyleInput
                    name={f.key}
                    value={style?.[f.key]}
                    onChange={(text) => setStyle(f.key, parseStyleValue(f.kind, text))}
                  />
                )}
              </label>
            ))}
          </div>
        </fieldset>
      ))}
    </div>
  );
}

/** 入力中の文字列（`1` → `10` の途中など）を手元に持ち、変わるたびに反映する。 */
function StyleInput({
  name,
  value,
  onChange,
}: {
  name: string;
  value: string | number | undefined;
  onChange: (text: string) => void;
}) {
  const external = value === undefined ? "" : String(value);
  const [text, setText] = useState(external);
  useEffect(() => {
    // キャンバスでのリサイズや undo など、外から変わったときだけ入れ替える
    setText((t) => (parseLooseEqual(t, value) ? t : external));
  }, [external, value]);
  return (
    <input
      aria-label={name}
      value={text}
      onChange={(e) => {
        setText(e.target.value);
        onChange(e.target.value);
      }}
    />
  );
}

function parseLooseEqual(text: string, value: string | number | undefined): boolean {
  if (value === undefined) return text.trim() === "";
  return text.trim() === String(value) || Number(text) === value;
}
