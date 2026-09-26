import {
  createScope,
  evaluateTemplate,
  resolveValue,
  type ActionContext,
  type BindingError,
  type RuntimeState,
} from "@ui-editor/runtime";
import type { Action, Events, JsonValue, Node, Project } from "@ui-editor/schema";
import type { CSSProperties, ReactNode } from "react";

/**
 * ノードツリーを実行時に解釈して React で描画する。
 * バインディングは描画のたびに評価し、イベントは `fire` でアクションとして実行する。
 */

export interface RenderEnv {
  project: Project;
  rt: RuntimeState;
  fire: (label: string, actions: readonly Action[], context: ActionContext) => void;
}

/** ノードの外側から受け継ぐスコープ。 */
interface Ctx {
  params?: unknown;
  props?: unknown;
  locals: Readonly<Record<string, unknown>>;
}

/** コンポーネントのインスタンスに付けたイベント（コンポーネントのルート要素のイベントとして扱う）。 */
interface InstanceEvents {
  events: Events;
  ctx: Ctx;
  label: string;
}

export function renderRoot(env: RenderEnv, root: Node, params: unknown): ReactNode {
  return <NodeView env={env} node={root} ctx={{ params, locals: {} }} />;
}

function scopeOf(env: RenderEnv, ctx: Ctx) {
  return createScope({
    data: env.rt.data,
    state: env.rt.state,
    params: ctx.params,
    props: ctx.props,
    locals: ctx.locals,
  });
}

function NodeView(props: {
  env: RenderEnv;
  node: Node;
  ctx: Ctx;
  instance?: InstanceEvents | undefined;
}) {
  const { env, node, ctx } = props;
  if (!node.repeat) return <Single {...props} />;

  const each = evaluateTemplate(node.repeat.each, scopeOf(env, ctx));
  if (each.errors.length > 0) return <Errors errors={each.errors} where={`${node.id}.repeat`} />;
  if (!Array.isArray(each.value))
    return (
      <Errors
        errors={[{ expression: node.repeat.each, error: "配列ではありません" }]}
        where={node.id}
      />
    );
  const repeat = node.repeat;
  return each.value.map((item, index) => {
    const inner: Ctx = { ...ctx, locals: { ...ctx.locals, [repeat.as]: item, index } };
    const key = repeat.key ? evaluateTemplate(repeat.key, scopeOf(env, inner)).value : index;
    return <Single key={String(key)} env={env} node={node} ctx={inner} instance={props.instance} />;
  });
}

function Single({
  env,
  node,
  ctx,
  instance,
}: {
  env: RenderEnv;
  node: Node;
  ctx: Ctx;
  instance?: InstanceEvents | undefined;
}) {
  const scope = scopeOf(env, ctx);
  const errors: BindingError[] = [];
  const resolve = (v: unknown) => {
    const r = resolveValue(v, scope);
    errors.push(...r.errors);
    return r.value;
  };

  if (node.visible !== undefined && !resolve(node.visible))
    return errors.length > 0 ? <Errors errors={errors} where={`${node.id}.visible`} /> : null;

  // Table の列の値は行ごとに評価するので、ここでは解決しない
  const { columns, ...rest } = node.props ?? {};
  const p = resolve(rest) as Record<string, unknown>;
  const style = toCss(resolve(node.style ?? {}) as Record<string, unknown>);

  // ノードのイベントと、コンポーネントのインスタンスのイベント（ルート要素のみ）
  const handler = (name: string) => {
    const own = node.events?.[name];
    const inst = instance?.events[name];
    if (!own && !inst) return undefined;
    return (event: unknown) => {
      if (inst)
        env.fire(`${instance!.label}.${name}`, inst, { ...contextOf(instance!.ctx), event });
      if (own) env.fire(`${node.id}.${name}`, own, { ...contextOf(ctx), event });
    };
  };
  const click = handler("click");
  const onClick = click
    ? (e: { stopPropagation: () => void }) => {
        e.stopPropagation();
        click({});
      }
    : undefined;
  const clickable: CSSProperties = onClick ? { cursor: "pointer" } : {};
  const err = errors.length > 0 ? <Errors errors={errors} where={node.id} /> : null;

  const children = (node.children ?? []).map((c) => (
    <NodeView key={c.id} env={env} node={c} ctx={ctx} />
  ));

  switch (node.type) {
    case "Box":
      return (
        <div
          className="pv-box"
          style={{ ...clickable, ...style }}
          onClick={onClick}
          data-node={node.id}
        >
          {err}
          {children}
        </div>
      );
    case "Text": {
      const variant = String(p.variant ?? "body");
      return (
        <span
          className={`pv-text pv-${variant}`}
          style={{ ...clickable, ...style }}
          onClick={onClick}
          data-node={node.id}
        >
          {text(p.text)}
          {err}
        </span>
      );
    }
    case "Button":
      return (
        <button
          className={`pv-button pv-${String(p.variant ?? "secondary")}`}
          style={style}
          disabled={Boolean(p.disabled)}
          onClick={onClick}
          data-node={node.id}
        >
          {text(p.label)}
          {err}
        </button>
      );
    case "TextInput":
    case "NumberInput": {
      const change = handler("change");
      const isNumber = node.type === "NumberInput";
      return (
        <label className="pv-field" style={style} data-node={node.id}>
          {p.label !== undefined && <span>{text(p.label)}</span>}
          <input
            type={isNumber ? "number" : "text"}
            value={p.value === undefined || p.value === null ? "" : String(p.value)}
            placeholder={p.placeholder === undefined ? undefined : text(p.placeholder)}
            disabled={Boolean(p.disabled)}
            min={num(p.min)}
            max={num(p.max)}
            step={num(p.step)}
            onChange={(e) =>
              change?.({
                value: isNumber
                  ? Number.isNaN(e.target.valueAsNumber)
                    ? null
                    : e.target.valueAsNumber
                  : e.target.value,
              })
            }
            readOnly={!change}
          />
          {err}
        </label>
      );
    }
    case "Checkbox": {
      const change = handler("change");
      return (
        <label className="pv-check" style={style} data-node={node.id}>
          <input
            type="checkbox"
            checked={Boolean(p.checked)}
            disabled={Boolean(p.disabled)}
            onChange={(e) => change?.({ value: e.target.checked })}
            readOnly={!change}
          />
          {text(p.label)}
          {err}
        </label>
      );
    }
    case "Table":
      return (
        <TableView
          env={env}
          node={node}
          ctx={ctx}
          rows={p.rows}
          columns={columns}
          style={style}
          err={err}
          onRow={handler("rowClick")}
        />
      );
  }

  // コンポーネントのインスタンス
  const component = env.project.components?.find((c) => c.id === node.type);
  if (!component)
    return (
      <Errors errors={[{ expression: node.type, error: "不明なノードの type" }]} where={node.id} />
    );
  const defaults = Object.fromEntries(
    Object.entries(component.props ?? {}).flatMap(([k, d]) =>
      d.default === undefined ? [] : [[k, d.default]],
    ),
  );
  return (
    <>
      {err}
      <NodeView
        env={env}
        node={component.root}
        ctx={{ props: { ...defaults, ...p }, locals: {} }}
        instance={node.events ? { events: node.events, ctx, label: node.id } : undefined}
      />
    </>
  );
}

function TableView(props: {
  env: RenderEnv;
  node: Node;
  ctx: Ctx;
  rows: unknown;
  columns: JsonValue | undefined;
  style: CSSProperties;
  err: ReactNode;
  onRow: ((event: unknown) => void) | undefined;
}) {
  const { env, ctx } = props;
  const rows = Array.isArray(props.rows) ? props.rows : [];
  const columns = (Array.isArray(props.columns) ? props.columns : []) as {
    header?: string;
    value?: string;
  }[];
  return (
    <table className="pv-table" style={props.style} data-node={props.node.id}>
      <thead>
        <tr>
          {columns.map((c, i) => (
            <th key={i}>{c.header}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, r) => {
          const scope = createScope({
            data: env.rt.data,
            state: env.rt.state,
            params: ctx.params,
            props: ctx.props,
            locals: { ...ctx.locals, row },
          });
          return (
            <tr
              key={r}
              onClick={props.onRow ? () => props.onRow!({ row }) : undefined}
              className={props.onRow ? "pv-clickable" : undefined}
            >
              {columns.map((c, i) => {
                const v = evaluateTemplate(c.value ?? "", scope);
                return (
                  <td key={i}>
                    {text(v.value)}
                    {v.errors.length > 0 && (
                      <Errors errors={v.errors} where={`${props.node.id}.columns[${i}]`} />
                    )}
                  </td>
                );
              })}
            </tr>
          );
        })}
      </tbody>
      {props.err && <caption>{props.err}</caption>}
    </table>
  );
}

function contextOf(ctx: Ctx): ActionContext {
  return { params: ctx.params, props: ctx.props, locals: ctx.locals };
}

/** バインディングのエラーを描画の中に出す（プレビューは止めない）。 */
function Errors({ errors, where }: { errors: BindingError[]; where: string }) {
  return (
    <span
      className="pv-error"
      title={errors.map((e) => `${where}: {{ ${e.expression} }}\n${e.error}`).join("\n\n")}
    >
      ⚠
    </span>
  );
}

function text(value: unknown): string {
  if (value === null || value === undefined) return "";
  return typeof value === "object" ? JSON.stringify(value) : String(value);
}

function num(value: unknown): number | undefined {
  return typeof value === "number" ? value : undefined;
}

/** スタイルは React の style にそのまま渡せる（数値は px になる）。解決できなかった値は落とす。 */
function toCss(style: Record<string, unknown>): CSSProperties {
  return Object.fromEntries(
    Object.entries(style).filter(([, v]) => typeof v === "string" || typeof v === "number"),
  ) as CSSProperties;
}
