import type { DataRecord, JsonValue, Node, Project, Style } from "@ui-editor/poc-model";
import {
  evaluate,
  requiresSatisfied,
  resolve,
  type RuntimeState,
  type Scope,
} from "@ui-editor/poc-runtime";
import type { CSSProperties, ReactNode } from "react";

/** ノードのイベントを発火する（ランタイムの fireEvent に渡す）。 */
export type Fire = (
  node: string,
  event: string,
  payload?: unknown,
  locals?: Readonly<Record<string, unknown>>,
) => void;

/** そのノードのイベントを発火する。 */
type LocalFire = (
  event: string,
  payload?: unknown,
  locals?: Readonly<Record<string, unknown>>,
) => void;

interface Ctx {
  project: Project;
  runtime: RuntimeState;
  /** フレームのスコープ（ループ変数は locals で足す）。 */
  scope: Scope;
  fire: Fire;
}

/** ノードの木を、スコープで式を評価しながら描く。 */
export function NodeView({
  node,
  ctx,
  locals = {},
}: {
  node: Node;
  ctx: Ctx;
  locals?: Readonly<Record<string, unknown>>;
}): ReactNode {
  const scope = Object.keys(locals).length ? { ...ctx.scope, ...locals } : ctx.scope;
  if (node.repeat) {
    const each = evaluate(node.repeat.each, scope);
    const items = Array.isArray(each.value) ? each.value : [];
    const { repeat: _repeat, ...single } = node;
    void _repeat;
    return (
      <>
        {items.map((item, index) => {
          const inner = { ...locals, [node.repeat!.as]: item, index };
          const key = node.repeat!.key
            ? evaluate(node.repeat!.key, { ...scope, ...inner }).value
            : index;
          return <NodeView key={String(key)} node={single} ctx={ctx} locals={inner} />;
        })}
      </>
    );
  }
  if (node.visible !== undefined) {
    const v = typeof node.visible === "string" ? evaluate(node.visible, scope).value : node.visible;
    if (!v) return null;
  }
  // 表の列（columns）の式は行ごとに評価するので、ここでは評価しない（row がまだ無い）
  const { columns: _columns, ...rest } = node.props ?? {};
  void _columns;
  const resolved = resolve(node.type === "Table" ? rest : (node.props ?? {}), scope);
  const props = (resolved.value ?? {}) as Record<string, unknown>;
  const problem = resolved.errors.map((e) => `{{ ${e.expression} }}: ${e.error}`).join("\n");
  const fire: LocalFire = (event, payload, extra) =>
    ctx.fire(node.id, event, payload, { ...locals, ...extra });
  const common = {
    "data-node": node.id,
    className: node.placeholder ? "pv-placeholder" : undefined,
    style: toCss(node.style, scope),
    title: problem || (node.placeholder ? "仮の部品" : undefined),
  };
  const children = node.children?.map((c) => (
    <NodeView key={c.id} node={c} ctx={ctx} locals={locals} />
  ));
  const warn = problem ? (
    <span className="pv-binding-error" title={problem}>
      ⚠
    </span>
  ) : null;

  switch (node.type) {
    case "Box":
      return (
        <div
          {...common}
          className={cls("pv-box", common.className)}
          style={{
            flexDirection: props.direction === "row" ? "row" : "column",
            gap: px(props.gap ?? 8),
            ...common.style,
          }}
          onClick={node.events?.click ? (e) => (e.stopPropagation(), fire("click")) : undefined}
        >
          {warn}
          {children}
        </div>
      );
    case "Text": {
      const Tag = props.variant === "title" ? "h2" : props.variant === "caption" ? "small" : "p";
      return (
        <Tag
          {...common}
          className={cls(`pv-text pv-text-${String(props.variant ?? "body")}`, common.className)}
          onClick={node.events?.click ? () => fire("click") : undefined}
        >
          {text(props.text)}
          {warn}
        </Tag>
      );
    }
    case "Button": {
      const blocked = !requiresSatisfied(ctx.project, ctx.runtime, props.requires);
      return (
        <button
          {...common}
          className={cls(
            `pv-button pv-button-${String(props.variant ?? "secondary")}`,
            common.className,
          )}
          disabled={Boolean(props.disabled) || blocked}
          title={blocked ? `${String(props.requires)} を選ぶと押せます` : common.title}
          onClick={(e) => {
            e.stopPropagation();
            fire("click");
          }}
        >
          {text(props.label) || "ボタン"}
          {warn}
        </button>
      );
    }
    case "TextInput":
    case "NumberInput":
      return (
        <label {...common} className={cls("pv-field", common.className)}>
          <span>{text(props.label)}</span>
          <input
            type={node.type === "NumberInput" ? "number" : "text"}
            value={props.value === null || props.value === undefined ? "" : String(props.value)}
            disabled={Boolean(props.disabled)}
            aria-invalid={props.error ? true : undefined}
            onChange={(e) =>
              fire("change", {
                value:
                  node.type === "NumberInput"
                    ? e.target.value === ""
                      ? null
                      : Number(e.target.value)
                    : e.target.value,
              })
            }
          />
          {props.error ? <span className="pv-error">{text(props.error)}</span> : null}
          {warn}
        </label>
      );
    case "Checkbox":
      return (
        <label {...common} className={cls("pv-check", common.className)}>
          <input
            type="checkbox"
            checked={props.checked === true}
            disabled={Boolean(props.disabled)}
            onChange={(e) => fire("change", { value: e.target.checked })}
          />
          <span>{text(props.label)}</span>
          {warn}
        </label>
      );
    case "Select": {
      const options = Array.isArray(props.options)
        ? (props.options as { value?: unknown; label?: unknown }[])
        : [];
      return (
        <label {...common} className={cls("pv-field", common.className)}>
          <span>{text(props.label)}</span>
          <select
            value={props.value === null || props.value === undefined ? "" : String(props.value)}
            aria-invalid={props.error ? true : undefined}
            onChange={(e) =>
              fire("change", { value: e.target.value === "" ? null : e.target.value })
            }
          >
            <option value="">（選んでください）</option>
            {options.map((o, i) => (
              <option key={i} value={String(o.value)}>
                {text(o.label ?? o.value)}
              </option>
            ))}
          </select>
          {props.error ? <span className="pv-error">{text(props.error)}</span> : null}
          {warn}
        </label>
      );
    }
    case "Table":
      return (
        <TableView
          node={node}
          props={props}
          common={common}
          ctx={ctx}
          scope={scope}
          fire={fire}
          warn={warn}
        />
      );
    default:
      return (
        <div {...common} className="pv-unknown">
          {node.type}（プレビューでは描けない部品）
        </div>
      );
  }
}

function TableView({
  node,
  props,
  common,
  ctx,
  scope,
  fire,
  warn,
}: {
  node: Node;
  props: Record<string, unknown>;
  common: { className?: string | undefined; style: CSSProperties; title?: string | undefined };
  ctx: Ctx;
  scope: Scope;
  fire: LocalFire;
  warn: ReactNode;
}) {
  const rows = Array.isArray(props.rows) ? (props.rows as unknown[]) : [];
  const entity = ctx.project.entities.find((e) => e.id === props.entity);
  const pk = entity?.primaryKey ?? "id";
  const selected = entity ? ctx.runtime.selection[entity.id] : undefined;
  // columns の value は行ごとに評価するので、node.props の元の式を使う
  const raw = node.props?.columns;
  const columns: { header: string; value: string }[] = Array.isArray(raw)
    ? raw.map((c) => {
        const col = c as Record<string, JsonValue>;
        return {
          header: text(evaluate(String(col.header ?? ""), scope).value),
          value: String(col.value ?? ""),
        };
      })
    : Object.keys((rows[0] as Record<string, unknown> | undefined) ?? {})
        .filter((k) => typeof (rows[0] as Record<string, unknown>)[k] !== "object")
        .map((k) => ({ header: k, value: `{{ row.${k} }}` }));
  const selectable = props.selectable === true;
  return (
    <div {...common} className={cls("pv-table-wrap", common.className)} data-node={node.id}>
      {warn}
      <table className="pv-table">
        <thead>
          <tr>
            {selectable && <th aria-label="選択" />}
            {columns.map((c, i) => (
              <th key={i}>{c.header}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td colSpan={columns.length + (selectable ? 1 : 0)} className="pv-empty">
                データがありません
              </td>
            </tr>
          )}
          {rows.map((row, i) => {
            const r = row as DataRecord;
            const isSelected = selected !== undefined && selected !== null && r?.[pk] === selected;
            return (
              <tr
                key={String(r?.[pk] ?? i)}
                className={isSelected ? "selected" : undefined}
                onClick={() => fire("rowClick", { row }, { row, index: i })}
              >
                {selectable && (
                  <td onClick={(e) => e.stopPropagation()}>
                    <input
                      type="radio"
                      aria-label={`${String(r?.[pk] ?? i)} を選ぶ`}
                      checked={isSelected}
                      onChange={() => fire("rowSelect", { row }, { row, index: i })}
                    />
                  </td>
                )}
                {columns.map((c, j) => (
                  <td key={j}>{cell(evaluate(c.value, { ...scope, row, index: i }).value)}</td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function cell(v: unknown): string {
  if (v === true) return "✓";
  if (v === false) return "—";
  return text(v);
}

function text(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

function cls(...names: (string | undefined)[]): string {
  return names.filter(Boolean).join(" ");
}

function px(v: unknown): string | undefined {
  if (typeof v === "number") return `${v}px`;
  return typeof v === "string" ? v : undefined;
}

const UNITLESS = new Set(["flex", "flexGrow", "flexShrink", "fontWeight"]);

/** style（数値は px）を CSS に。`{{ }}` を含む値は評価する。 */
function toCss(style: Style | undefined, scope: Scope): CSSProperties {
  if (!style) return {};
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(style)) {
    const value = typeof v === "string" ? evaluate(v, scope).value : v;
    out[k] = typeof value === "number" && !UNITLESS.has(k) ? `${value}px` : value;
  }
  return out as CSSProperties;
}
