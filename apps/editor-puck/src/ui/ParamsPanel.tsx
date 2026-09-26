import type { ParamDef } from "@ui-editor/schema";
import { useState } from "react";
import { textToValue, valueToText } from "../puck/value-text.ts";

type Row = { name: string; type: string; default: string };

function toRows(params: Record<string, ParamDef> | undefined): Row[] {
  return Object.entries(params ?? {}).map(([name, def]) => ({
    name,
    type: def.type,
    default: valueToText(def.default),
  }));
}

function toParams(rows: Row[]): Record<string, ParamDef> {
  const out: Record<string, ParamDef> = {};
  for (const row of rows) {
    if (row.name === "") continue;
    const def: ParamDef = { type: row.type || "string" };
    const value = textToValue(row.default);
    if (value !== undefined) def.default = value;
    out[row.name] = def;
  }
  return out;
}

/**
 * コンポーネントの props / ダイアログの params の定義を編集する。
 * 行は手元の state に持ち、変更のたびにプロジェクトへ反映する（名前が空の行は反映しない）。
 * 画面を切り替えたら key で作り直す前提。
 */
export function ParamsPanel(props: {
  title: string;
  hint: string;
  params: Record<string, ParamDef> | undefined;
  onChange: (params: Record<string, ParamDef>) => void;
}) {
  const [rows, setRows] = useState<Row[]>(() => toRows(props.params));

  function update(next: Row[]) {
    setRows(next);
    props.onChange(toParams(next));
  }
  const edit = (i: number, patch: Partial<Row>) =>
    update(rows.map((row, j) => (j === i ? { ...row, ...patch } : row)));

  const names = rows.map((r) => r.name).filter(Boolean);
  const duplicated = names.filter((n, i) => names.indexOf(n) !== i);

  return (
    <section className="params">
      <div className="params__head">
        <strong>{props.title}</strong>
        <span className="params__hint">{props.hint}</span>
        <button
          type="button"
          onClick={() => update([...rows, { name: "", type: "string", default: "" }])}
        >
          ＋ 追加
        </button>
      </div>
      {rows.length > 0 && (
        <table className="params__table">
          <thead>
            <tr>
              <th>名前</th>
              <th>型（TS）</th>
              <th>既定値（空なら必須）</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i}>
                <td>
                  <input
                    aria-label="名前"
                    value={row.name}
                    placeholder="label"
                    onChange={(e) => edit(i, { name: e.currentTarget.value })}
                  />
                </td>
                <td>
                  <input
                    aria-label="型"
                    value={row.type}
                    placeholder="string"
                    onChange={(e) => edit(i, { type: e.currentTarget.value })}
                  />
                </td>
                <td>
                  <input
                    aria-label="既定値"
                    value={row.default}
                    onChange={(e) => edit(i, { default: e.currentTarget.value })}
                  />
                </td>
                <td>
                  <button type="button" onClick={() => update(rows.filter((_, j) => j !== i))}>
                    削除
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {duplicated.length > 0 && (
        <p className="params__error">名前が重複しています: {[...new Set(duplicated)].join(", ")}</p>
      )}
    </section>
  );
}
