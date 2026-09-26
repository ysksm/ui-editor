import {
  type BuiltinNodeType,
  type JsonValue,
  type Node,
  type ParamDef,
  type Project,
  type Style,
} from "@ui-editor/schema";
import { createContext, useContext, type CSSProperties, type ReactNode, type Ref } from "react";
import { isBuiltin } from "../project/convert";
import { resolveTemplate, resolveValue, type Scope } from "../project/evaluate";

/**
 * パーツの見た目。Craft のノード（キャンバス）とコンポーネントのプレビュー（読み取り専用）の両方で使う。
 * バインディングはサンプルデータで評価し、評価できなければ `{{ }}` の文字列のまま表示する。
 */

export const ProjectContext = createContext<Project | null>(null);

export function useProject(): Project {
  const project = useContext(ProjectContext);
  if (!project) throw new Error("ProjectContext がありません");
  return project;
}

/** バインディングの評価に使う名前。repeat したノードの中では要素の変数が加わる。 */
export const ScopeContext = createContext<Scope>({});

/** プロジェクト全体で共通のスコープ（`data` / `state` / `params`）。 */
export function baseScope(project: Project): Scope {
  const state = Object.fromEntries(
    Object.entries(project.state ?? {}).map(([k, def]) => [k, def.initial]),
  );
  return { data: project.sampleData, state, params: {} };
}

/** repeat の 1 件目を変数に入れたスコープを返す（キャンバスには 1 件分だけ描く）。 */
export function repeatScope(
  repeat: Node["repeat"],
  scope: Scope,
): { scope: Scope; count: number | undefined } {
  if (!repeat) return { scope, count: undefined };
  const items = resolveTemplate(repeat.each, scope);
  if (!Array.isArray(items)) return { scope, count: undefined };
  return { scope: { ...scope, [repeat.as]: items[0], index: 0 }, count: items.length };
}

export function isHidden(visible: Node["visible"], scope: Scope): boolean {
  if (visible === undefined) return false;
  if (typeof visible === "boolean") return !visible;
  return resolveTemplate(visible, scope) === false;
}

export function toCss(style: Style | undefined, scope: Scope): CSSProperties {
  if (!style) return {};
  return Object.fromEntries(
    Object.entries(style).map(([k, v]) => [
      k,
      typeof v === "string" ? resolveTemplate(v, scope) : v,
    ]),
  ) as CSSProperties;
}

function text(value: unknown): string {
  if (value === undefined || value === null) return "";
  return typeof value === "object" ? JSON.stringify(value) : String(value);
}

export interface BuiltinViewProps {
  type: BuiltinNodeType;
  props?: Record<string, JsonValue> | undefined;
  style?: CSSProperties;
  scope: Scope;
  children?: ReactNode;
  className?: string;
  /** エディタ上の P0 のノード id（`data-node-id` 属性）。 */
  nodeId?: string | undefined;
  ref?: Ref<HTMLElement> | undefined;
}

/** 組み込みパーツ 1 つ分の描画。 */
export function BuiltinView({
  type,
  props = {},
  style,
  scope,
  children,
  className,
  nodeId,
  ref,
}: BuiltinViewProps) {
  const p = (key: string) => resolveValue(props[key], scope);
  const common = { className, style, "data-node-id": nodeId, ref: ref as Ref<never> };
  switch (type) {
    case "Box":
      return <div {...common}>{children}</div>;
    case "Text":
      return (
        <div
          {...common}
          className={cx(className, `part-text part-text--${text(p("variant")) || "body"}`)}
        >
          {text(p("text"))}
        </div>
      );
    case "Button":
      return (
        <button
          type="button"
          {...common}
          className={cx(className, `part-button part-button--${text(p("variant")) || "primary"}`)}
          disabled={p("disabled") === true}
        >
          {text(p("label"))}
        </button>
      );
    case "TextInput":
    case "NumberInput":
      return (
        <label {...common} className={cx(className, "part-field")}>
          <span>{text(p("label"))}</span>
          <input
            type={type === "NumberInput" ? "number" : "text"}
            value={text(p("value"))}
            placeholder={text(p("placeholder"))}
            disabled={p("disabled") === true}
            readOnly
            tabIndex={-1}
          />
        </label>
      );
    case "Checkbox":
      return (
        <label {...common} className={cx(className, "part-checkbox")}>
          <input type="checkbox" checked={p("checked") === true} readOnly tabIndex={-1} />
          <span>{text(p("label"))}</span>
        </label>
      );
    case "Table":
      return <TableView {...common} props={props} scope={scope} />;
  }
}

function TableView({
  props,
  scope,
  ...common
}: {
  props: Record<string, JsonValue>;
  scope: Scope;
  className?: string | undefined;
  style?: CSSProperties | undefined;
  ref: Ref<never>;
}) {
  const rows = resolveValue(props.rows, scope);
  const columns = Array.isArray(props.columns) ? props.columns : [];
  const col = (c: JsonValue, key: string): JsonValue | undefined =>
    c !== null && typeof c === "object" && !Array.isArray(c) ? c[key] : undefined;
  return (
    <table {...common} className={cx(common.className, "part-table")}>
      <thead>
        <tr>
          {columns.map((c, i) => (
            <th key={i}>{text(resolveValue(col(c, "header"), scope))}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {Array.isArray(rows) ? (
          rows.slice(0, 20).map((row, r) => (
            <tr key={r}>
              {columns.map((c, i) => (
                <td key={i}>{text(resolveValue(col(c, "value"), { ...scope, row }))}</td>
              ))}
            </tr>
          ))
        ) : (
          <tr>
            <td colSpan={columns.length || 1} className="part-table__empty">
              rows: {text(props.rows)}
            </td>
          </tr>
        )}
      </tbody>
    </table>
  );
}

/** コンポーネントの props の初期値（`default`、無ければ型から推測した仮の値）。 */
export function defaultPropsOf(
  defs: Record<string, ParamDef> | undefined,
  dataModelSource = "",
): Record<string, JsonValue> {
  return Object.fromEntries(
    Object.entries(defs ?? {}).map(([name, def]) => [
      name,
      def.default !== undefined ? def.default : placeholderFor(name, def.type, dataModelSource),
    ]),
  );
}

function placeholderFor(name: string, type: string, source: string): JsonValue {
  const t = type.trim();
  if (t === "number") return 0;
  if (t === "boolean") return false;
  if (t === "string") return name;
  // "a" | "b" のようなリテラル型、またはデータモデルの `type X = "a" | ...` なら最初の値
  const alias = new RegExp(`type\\s+${t}\\s*=\\s*([^;]+);`).exec(source)?.[1] ?? t;
  const literal = /^\s*"([^"]*)"/.exec(alias);
  if (literal) return literal[1] ?? "";
  return "";
}

/** コンポーネントのインスタンス（中身はコンポーネントの定義から読み取り専用で描く）。 */
export function InstanceView({
  component,
  props,
  scope,
  depth = 0,
}: {
  component: string;
  props: Record<string, JsonValue> | undefined;
  scope: Scope;
  depth?: number;
}) {
  const project = useProject();
  const def = project.components?.find((c) => c.id === component);
  if (!def) return <div className="part-missing">未定義のコンポーネント: {component}</div>;
  if (depth > 8) return <div className="part-missing">入れ子が深すぎます: {component}</div>;
  const resolved = Object.fromEntries(
    Object.entries({ ...defaultPropsOf(def.props, project.dataModel.source), ...props }).map(
      ([k, v]) => [k, resolveValue(v, scope)],
    ),
  );
  // コンポーネントの中からは repeat の変数などは見えない
  const inner: Scope = { ...baseScope(project), props: resolved };
  return <StaticNode node={def.root} scope={inner} depth={depth + 1} />;
}

/** P0 のノードをそのまま描く（編集はできない）。 */
export function StaticNode({ node, scope, depth }: { node: Node; scope: Scope; depth: number }) {
  const { scope: s } = repeatScope(node.repeat, scope);
  if (isHidden(node.visible, s)) return null;
  const style = toCss(node.style, s);
  if (!isBuiltin(node.type)) {
    return (
      <div style={style}>
        <InstanceView component={node.type} props={node.props} scope={s} depth={depth} />
      </div>
    );
  }
  return (
    <BuiltinView type={node.type} props={node.props} style={style} scope={s}>
      {node.children?.map((c) => (
        <StaticNode key={c.id} node={c} scope={s} depth={depth} />
      ))}
    </BuiltinView>
  );
}

export function cx(...names: (string | false | undefined)[]): string {
  return names.filter(Boolean).join(" ");
}
