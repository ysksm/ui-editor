import {
  NODE_EVENTS,
  nestParents,
  SELECTION_PATH,
  type BuiltinNodeType,
  type Action,
  type Container,
  type ContainerKind,
  type Entity,
  type JsonValue,
  type Node,
  type Project,
} from "@ui-editor/poc-model";
import { propKey } from "../names.js";
import { attr, template, value, type ExprScope } from "./expr.js";
import { Imports } from "./imports.js";

/**
 * 画面・ダイアログ 1 つを React のコンポーネントにする（architecture.md 4.12 の「プレビューと生成コードの対応」）。
 * - ノードの木 → JSX（部品は src/ui/）
 * - イベントのアクション列 → イベントの関数（1 アクション 1 文、失敗したら return、when は if）
 * - 式で使った名前（data・state・params・record・draft・errors）だけをフックで用意する
 */

/** 式のスコープの名前（エディタのプレビューと同じ）。 */
const SCOPE_NAMES = ["data", "state", "params", "record", "draft", "errors"] as const;
/** アクションで変わりうるもの（変えたあとに使うなら読み直す）。 */
const STORE_NAMES = new Set(["data", "state", "record", "draft", "errors"]);
/** 生成するコードが使う名前（repeat の as には使えない）。 */
const GENERATED_NAMES = new Set([
  ...SCOPE_NAMES,
  "event",
  "row",
  "index",
  "form",
  "navigate",
  "back",
  "text",
  "present",
  "select",
  "openDialog",
  "closeDialog",
  "setUiState",
  "notify",
]);

export interface ContainerInfo {
  kind: ContainerKind;
  container: Container;
  /** コンポーネント名（例: DeviceDetailScreen）。 */
  component: string;
}

export interface EmittedContainer {
  path: string;
  source: string;
  /** ダイアログが params を受け取るか（DialogHost で渡すか）。 */
  usesParams: boolean;
}

interface Ctx {
  project: Project;
  info: ContainerInfo;
  entities: Map<string, Entity>;
  nest: ReturnType<typeof nestParents>;
  imports: Imports;
  problems: string[];
  /** コンポーネントの先頭で用意する名前。 */
  used: Set<string>;
  /** 使ったナビゲーションの関数。 */
  nav: Set<"navigate" | "back">;
  /** フォーム（kind: form と entity）なら、そのエンティティ。 */
  formEntity: Entity | undefined;
  usesForm: boolean;
  /** record を引く ref パラメータ。 */
  recordParam: string | undefined;
}

export function emitContainer(project: Project, info: ContainerInfo): EmittedContainer {
  const c = info.container;
  const entities = new Map(project.entities.map((e) => [e.id, e]));
  const formEntity = c.kind === "form" && c.entity ? entities.get(c.entity) : undefined;
  const ctx: Ctx = {
    project,
    info,
    entities,
    nest: nestParents(project.entities),
    imports: new Imports(),
    problems: [],
    used: new Set(),
    nav: new Set(),
    formEntity,
    usesForm: false,
    recordParam: c.entity
      ? Object.entries(c.params ?? {}).find(
          ([, def]) => def.type === "ref" && def.entity === c.entity,
        )?.[0]
      : undefined,
  };
  const where = `${info.kind === "screen" ? "画面" : "ダイアログ"} ${c.id}`;

  // 本体（JSX）と mount を先に作り、使った名前を集める
  const body = c.root ? node(c.root, ctx, new Set(), where) : "null";
  const mount =
    info.kind === "screen" && "events" in c && c.events?.mount?.length
      ? statements(c.events.mount, ctx, {
          names: new Set(SCOPE_NAMES),
          where: `${where} / mount`,
          dirty: false,
          fresh: false,
        })
      : undefined;

  if (ctx.problems.length > 0) throw new ContainerError(ctx.problems);
  if (mount) ctx.imports.value("../store/hooks", "useMount");

  // フック（使った名前だけ）
  const lines: string[] = [];
  const needsParams =
    ctx.used.has("params") ||
    (ctx.used.has("record") && ctx.recordParam !== undefined) ||
    (ctx.usesForm && (ctx.recordParam !== undefined || formParent(ctx) !== undefined));
  if (needsParams && info.kind === "screen") {
    ctx.imports.value("../navigation", "useScreenParams");
    lines.push(`const params = useScreenParams(${JSON.stringify(c.id)});`);
  }
  if (ctx.used.has("data")) {
    ctx.imports.value("../store/hooks", "useDataView");
    lines.push("const data = useDataView();");
  }
  if (ctx.used.has("state")) {
    ctx.imports.value("../store/hooks", "useUiState");
    lines.push("const state = useUiState();");
  }
  if (ctx.used.has("record")) lines.push(`const record = ${recordExpr(ctx, "useRecord")};`);
  if (ctx.usesForm && ctx.formEntity) {
    ctx.imports.value("../store/form", "useForm");
    const opts: string[] = [];
    if (ctx.recordParam) opts.push(`recordId: params.${ctx.recordParam}`);
    const parent = formParent(ctx);
    if (parent) opts.push(`parentId: params.${parent}`);
    lines.push(
      `const form = useForm(${JSON.stringify(ctx.formEntity.id)}${opts.length ? `, { ${opts.join(", ")} }` : ""});`,
    );
  }
  const formNames = (["draft", "errors"] as const).filter((n) => ctx.used.has(n));
  if (formNames.length > 0) {
    if (ctx.formEntity) lines.push(`const { ${formNames.join(", ")} } = form;`);
    else for (const n of formNames) lines.push(`const ${n}: Record<string, unknown> = {};`);
  }
  if (ctx.nav.size > 0) {
    ctx.imports.value("../navigation", "useNavigator");
    lines.push(`const { ${[...ctx.nav].sort().join(", ")} } = useNavigator();`);
  }
  if (mount) lines.push(`useMount(${handler("", mount)});`);

  const doc = docOf(project, info);
  let source: string;
  if (info.kind === "screen") {
    source = `/** ${doc} */
export function ${info.component}() {
${lines.join("\n")}
return ${body};
}`;
  } else {
    ctx.imports.value("../ui/Dialog", "Dialog").value("../store/store", "closeDialog");
    const usesParams = needsParams;
    if (usesParams) ctx.imports.type("../model/types", "DialogParams");
    source = `/** ${doc} */
export function ${info.component}(${usesParams ? `{ params }: { params: DialogParams[${JSON.stringify(c.id)}] }` : ""}) {
${lines.join("\n")}
return (
<Dialog ${attr("title", JSON.stringify(c.name))} onCancel={() => closeDialog("cancel")}>
${body}
</Dialog>
);
}`;
  }
  const folder = info.kind === "screen" ? "screens" : "dialogs";
  return {
    path: `src/${folder}/${info.component}.tsx`,
    source: `${ctx.imports.toString()}\n\n${source}\n`,
    usesParams: info.kind === "dialog" && needsParams,
  };
}

/** 生成できない理由（式の誤りなど）。 */
export class ContainerError extends Error {
  constructor(readonly problems: string[]) {
    super(problems.join("\n"));
  }
}

function docOf(project: Project, info: ContainerInfo): string {
  const c = info.container;
  const parts = [c.name];
  if (info.kind === "screen" && "path" in c && c.path) parts.push(`（${c.path}）`);
  if (c.kind && c.entity) {
    const e = project.entities.find((x) => x.id === c.entity);
    parts.push(`。${e?.name ?? c.entity}の${KIND_NAMES[c.kind]}`);
  }
  return parts.join("");
}

const KIND_NAMES = { list: "一覧", detail: "詳細", form: "フォーム", confirm: "確認" } as const;

/** フォームで作る入れ子のエンティティの親を指す ref パラメータ。 */
function formParent(ctx: Ctx): string | undefined {
  const e = ctx.formEntity;
  const n = e ? ctx.nest.get(e.id) : undefined;
  if (!n) return undefined;
  return Object.entries(ctx.info.container.params ?? {}).find(
    ([, def]) => def.type === "ref" && def.entity === n.parent,
  )?.[0];
}

/** record（画面のエンティティと同じエンティティの ref パラメータで引く。無ければ null）。 */
function recordExpr(ctx: Ctx, fn: "useRecord" | "readRecord"): string {
  const c = ctx.info.container;
  if (!c.entity) return "null";
  ctx.imports.value("../store/hooks", fn);
  return `${fn}(${JSON.stringify(c.entity)}, ${ctx.recordParam ? `params.${ctx.recordParam}` : "undefined"})`;
}

// ---- ノード → JSX ----

function scopeOf(ctx: Ctx, names: ReadonlySet<string>, where: string): ExprScope {
  return { names, where, used: new Set(), problems: ctx.problems };
}

/** スコープで使った名前をコンポーネントに伝える（ローカルの名前は除く）。 */
function collect(ctx: Ctx, scope: ExprScope, locals: ReadonlySet<string>): void {
  for (const n of scope.used) if (!locals.has(n)) ctx.used.add(n);
  if (scope.usesText) ctx.imports.value("../runtime/values", "text");
}

/** ノード（repeat・visible を含む）を JSX の要素にする。 */
function node(n: Node, ctx: Ctx, locals: ReadonlySet<string>, where: string): string {
  const at = `${where} / ${n.id}`;
  if (n.repeat) {
    const { as } = n.repeat;
    if (GENERATED_NAMES.has(as))
      ctx.problems.push(`${at} / repeat.as: "${as}" は生成するコードの名前と同じなので使えません`);
    const outer = scopeOf(ctx, names(locals), `${at} / repeat.each`);
    const each = template(n.repeat.each, outer);
    collect(ctx, outer, locals);
    const inner = new Set([...locals, as, "index"]);
    const keyScope = scopeOf(ctx, names(inner), `${at} / repeat.key`);
    const key = n.repeat.key ? template(n.repeat.key, keyScope) : "index";
    collect(ctx, keyScope, inner);
    const { repeat: _repeat, ...single } = n;
    void _repeat;
    const element = withKey(node(single, ctx, inner, where), key, ctx);
    return `<>{(${each} ?? []).map((${as}, index) => ${element})}</>`;
  }
  const element = plain(n, ctx, locals, at);
  if (n.visible === undefined || n.visible === true) return element;
  if (n.visible === false) return "null";
  const scope = scopeOf(ctx, names(locals), `${at} / visible`);
  const cond = template(n.visible, scope);
  collect(ctx, scope, locals);
  return `<>{${cond} ? ${element} : null}</>`;
}

/** 要素の最初のタグに key を足す（repeat の中）。 */
function withKey(element: string, key: string, ctx: Ctx): string {
  if (element.startsWith("<>")) {
    ctx.imports.value("react", "Fragment");
    return `<Fragment key={${key}}>${element.slice(2, -3)}</Fragment>`;
  }
  return element.replace(/^<([A-Za-z]+)/, `<$1 key={${key}}`);
}

/** 子の要素（visible・repeat の包みは `{…}` にする）。 */
function child(n: Node, ctx: Ctx, locals: ReadonlySet<string>, where: string): string {
  const element = node(n, ctx, locals, where);
  if (element === "null") return "";
  if (element.startsWith("<>{") && element.endsWith("}</>")) return element.slice(2, -3);
  return element;
}

function names(locals: ReadonlySet<string>): Set<string> {
  return new Set([...SCOPE_NAMES, ...locals]);
}

function plain(n: Node, ctx: Ctx, locals: ReadonlySet<string>, at: string): string {
  const props = n.props ?? {};
  const scope = scopeOf(ctx, names(locals), `${at} / props`);
  const p = (key: string) => (props[key] === undefined ? undefined : value(props[key], scope));
  const attrs: string[] = [];
  const put = (name: string, code: string | undefined) => {
    if (code !== undefined) attrs.push(attr(name, code));
  };
  const ui = (name: string) => ctx.imports.value(`../ui/${name}`, name);
  let tag: string = n.type;
  let children = "";

  switch (n.type) {
    case "Box":
      put("direction", p("direction"));
      put("gap", p("gap"));
      children = (n.children ?? [])
        .map((c) => child(c, ctx, locals, at))
        .filter(Boolean)
        .join("\n");
      break;
    case "Text":
      put("text", p("text"));
      put("variant", p("variant"));
      break;
    case "Button":
      put("label", p("label"));
      put("variant", p("variant"));
      put("disabled", p("disabled"));
      if (typeof props.requires === "string" && props.requires !== "") {
        put("requires", requiresExpr(props.requires, ctx));
        put("requiresMessage", JSON.stringify(requiresMessage(props.requires, ctx)));
      }
      break;
    case "TextInput":
    case "NumberInput":
    case "Select":
      put("label", p("label"));
      put("value", p("value"));
      if (n.type === "Select") put("options", p("options"));
      put("error", p("error"));
      put("disabled", p("disabled"));
      break;
    case "Checkbox":
      put("label", p("label"));
      put("checked", p("checked"));
      put("disabled", p("disabled"));
      break;
    case "Table":
      table(n, ctx, locals, at, scope, put);
      break;
    default:
      tag = "Text";
      put("text", JSON.stringify(`${n.type}（生成できない部品）`));
  }
  if (n.style) put("style", styleExpr(n.style as Record<string, JsonValue>, scope));
  collect(ctx, scope, locals);
  ui(tag);
  events(n, ctx, locals, at, put);
  const open = `<${tag}${attrs.length ? ` ${attrs.join(" ")}` : ""}`;
  return tag === "Box" && children ? `${open}>\n${children}\n</${tag}>` : `${open} />`;
}

function styleExpr(style: Record<string, JsonValue>, scope: ExprScope): string {
  return `{ ${Object.entries(style)
    .map(([k, v]) => `${propKey(k)}: ${value(v, scope)}`)
    .join(", ")} }`;
}

/** Button の requires（`selection.Device` や state のパス）→ 式。 */
function requiresExpr(path: string, ctx: Ctx): string {
  ctx.used.add("state");
  return `state${path
    .split(".")
    .map((k) => (/^[A-Za-z_$][\w$]*$/.test(k) ? `.${k}` : `[${JSON.stringify(k)}]`))
    .join("")}`;
}

function requiresMessage(path: string, ctx: Ctx): string {
  const m = SELECTION_PATH.exec(path);
  const e = m ? ctx.entities.get(m[1]!) : undefined;
  return e ? `${e.name}を選ぶと押せます` : `${path} があるときに押せます`;
}

function table(
  n: Node,
  ctx: Ctx,
  locals: ReadonlySet<string>,
  at: string,
  scope: ExprScope,
  put: (name: string, code: string | undefined) => void,
): void {
  const props = n.props ?? {};
  put("rows", props.rows === undefined ? "[]" : value(props.rows, scope));
  const entity = typeof props.entity === "string" ? ctx.entities.get(props.entity) : undefined;
  if (entity) {
    put("rowKey", `(row) => row.${entity.primaryKey}`);
    ctx.used.add("state");
    put("selectedKey", `state.selection.${entity.id}?.${entity.primaryKey}`);
  }
  if (props.selectable === true) put("selectable", "true");
  if (Array.isArray(props.columns)) {
    const cols = props.columns.map((raw, i) => {
      const col = (raw ?? {}) as Record<string, JsonValue>;
      const header = value(col.header ?? "", scope);
      const inner = new Set([...locals, "row", "index"]);
      const cell = scopeOf(ctx, names(inner), `${at} / columns[${i}].value`);
      const v = value(col.value ?? "", cell);
      collect(ctx, cell, inner);
      const params = cell.used.has("index")
        ? "(row, index)"
        : cell.used.has("row")
          ? "(row)"
          : "()";
      return `{ header: ${header}, value: ${params} => ${v} }`;
    });
    put("columns", `[${cols.join(", ")}]`);
  }
}

// ---- イベント → 関数 ----

/** イベントの値（event）の有無と、表の行のローカル（row・index）。 */
const EVENT_PAYLOAD: Record<string, "value" | "row" | undefined> = {
  change: "value",
  rowClick: "row",
  rowSelect: "row",
};

const EVENT_PROPS: Record<string, string> = {
  click: "onClick",
  change: "onChange",
  rowClick: "onRowClick",
  rowSelect: "onRowSelect",
};

function events(
  n: Node,
  ctx: Ctx,
  locals: ReadonlySet<string>,
  at: string,
  put: (name: string, code: string | undefined) => void,
): void {
  const list = Object.entries(n.events ?? {});
  // 表に entity があれば、行を選ぶと（アクションが無くても）先に選択を変える（プレビューと同じ）
  const entity =
    n.type === "Table" && typeof n.props?.entity === "string"
      ? ctx.entities.get(n.props.entity)
      : undefined;
  if (entity && !list.some(([e]) => e === "rowSelect")) list.push(["rowSelect", []]);
  for (const [event, actions] of list) {
    // その部品が出さないイベントは、プレビューでも起きないので書かない
    const prop = EVENT_PROPS[event];
    if (!prop || !(NODE_EVENTS[n.type as BuiltinNodeType] ?? []).includes(event)) continue;
    const payload = EVENT_PAYLOAD[event];
    const inner = new Set([
      ...locals,
      ...(payload ? ["event"] : []),
      ...(payload === "row" ? ["row", "index"] : []),
    ]);
    const pre: string[] = [];
    let dirty = false;
    if (n.type === "Button" && typeof n.props?.requires === "string" && n.props.requires !== "") {
      ctx.imports.value("../runtime/values", "present");
      pre.push(`if (!present(${requiresExpr(n.props.requires, ctx)})) return;`);
    }
    if (event === "rowSelect" && entity) {
      ctx.imports.value("../store/store", "select");
      pre.push(`select(${JSON.stringify(entity.id)}, event.row.${entity.primaryKey});`);
      dirty = true;
    }
    const used = new Set<string>();
    const body = statements(actions, ctx, {
      names: names(inner),
      where: `${at} / events.${event}`,
      dirty,
      fresh: false,
      locals: inner,
      usedLocals: used,
    });
    const head: string[] = [];
    if (used.has("row")) head.push("const row = event.row;");
    const all = [...pre, ...head, ...body];
    if (all.length === 0) continue;
    const usesEvent =
      used.has("event") || used.has("row") || (event === "rowSelect" && entity !== undefined);
    const args = used.has("index") ? "event, index" : usesEvent ? "event" : "";
    put(prop, handler(args, all));
  }
}

/** 全体が 1 つのブロック（`{ … }`）なら中身だけにする。 */
function unwrap(body: string[]): string[] {
  if (body[0] !== "{" || body.at(-1) !== "}") return body;
  let depth = 0;
  for (const [i, line] of body.entries()) {
    if (line.endsWith("{")) depth++;
    else if (line === "}") depth--;
    if (depth === 0 && i < body.length - 1) return body;
  }
  return body.slice(1, -1);
}

/** イベントの関数（1 文なら式の本体）。 */
function handler(args: string, lines: string[]): string {
  const body = unwrap(lines);
  const params = `(${args})`;
  const only = body.length === 1 ? body[0]! : undefined;
  if (
    only &&
    !/^(if|const|let|\{|return)\b/.test(only) &&
    !only.startsWith("{") &&
    !only.includes("\n")
  )
    return `${params} => ${only.replace(/;$/, "")}`;
  return `${params} => {\n${body.join("\n")}\n}`;
}

interface StatementCtx {
  names: ReadonlySet<string>;
  where: string;
  /** 前のアクションでデータ・state・下書きが変わったか（変わったあとに使う値は読み直す）。 */
  dirty: boolean;
  /** あとで呼ばれる（onClose）ので、ストアの値はいつも読み直す。 */
  fresh: boolean;
  /** イベントのローカルの名前（event・row・index・repeat の as）。 */
  locals?: ReadonlySet<string>;
  /** 使ったローカルの名前を記録する。 */
  usedLocals?: Set<string>;
}

/** アクションを変える（状態が変わる）もの。 */
const DIRTYING = new Set<Action["type"]>([
  "createRecord",
  "updateRecord",
  "deleteRecord",
  "saveDraft",
  "setDraft",
  "setState",
  "select",
  "closeDialog",
  "back",
]);

/** アクション列 → 文の列。 */
function statements(actions: readonly Action[], ctx: Ctx, sc: StatementCtx): string[] {
  const out: string[] = [];
  let dirty = sc.dirty;
  for (const [i, action] of actions.entries()) {
    const where = `${sc.where}[${i}] ${action.type}`;
    const scope = scopeOf(ctx, sc.names, where);
    const cond = action.when !== undefined ? template(action.when, scope) : undefined;
    const stmts = actionStatements(action, ctx, scope, sc);
    // 使った名前: ストアの値を読み直すか、コンポーネントで用意するか
    const reread = [...scope.used].filter((n) => STORE_NAMES.has(n) && (dirty || sc.fresh));
    for (const n of scope.used) {
      if (sc.locals?.has(n)) sc.usedLocals?.add(n);
      else if (!reread.includes(n)) ctx.used.add(n);
    }
    if (scope.usesText) ctx.imports.value("../runtime/values", "text");
    const guarded = cond !== undefined ? [`if (${cond}) {`, ...stmts, "}"] : stmts;
    if (reread.length > 0) {
      out.push(
        "{",
        "// 直前のアクションの結果を読み直す",
        ...rereadLines(reread, ctx),
        ...guarded,
        "}",
      );
    } else {
      out.push(...guarded);
    }
    if (DIRTYING.has(action.type)) dirty = true;
  }
  return out;
}

function rereadLines(names: string[], ctx: Ctx): string[] {
  const lines: string[] = [];
  if (names.includes("data")) {
    ctx.imports.value("../store/hooks", "readDataView");
    lines.push("const data = readDataView();");
  }
  if (names.includes("state")) {
    ctx.imports.value("../store/hooks", "readUiState");
    lines.push("const state = readUiState();");
  }
  if (names.includes("record")) {
    if (ctx.recordParam) ctx.used.add("params");
    lines.push(`const record = ${recordExpr(ctx, "readRecord")};`);
  }
  const formNames = names.filter((n) => n === "draft" || n === "errors");
  if (formNames.length > 0) {
    if (ctx.formEntity) {
      ctx.usesForm = true;
      lines.push(`const { ${formNames.join(", ")} } = form.read();`);
    } else for (const n of formNames) lines.push(`const ${n}: Record<string, unknown> = {};`);
  }
  return lines;
}

function entityFn(ctx: Ctx, verb: "create" | "update" | "delete", entity: string): string {
  const name = `${verb}${entity}`;
  ctx.imports.value("../store/records", name);
  return name;
}

function notFormStatements(ctx: Ctx, what: string): string[] {
  ctx.imports.value("../store/store", "notify");
  return [
    `notify("error", ${JSON.stringify(`フォーム（kind: form と entity）ではないので${what}`)});`,
    "return;",
  ];
}

function actionStatements(action: Action, ctx: Ctx, scope: ExprScope, sc: StatementCtx): string[] {
  const store = (name: string) => ctx.imports.value("../store/store", name);
  const params = (p: Record<string, JsonValue> | undefined) =>
    p && Object.keys(p).length > 0 ? value(p, scope) : undefined;
  switch (action.type) {
    case "navigate": {
      ctx.nav.add("navigate");
      const p = params(action.params);
      return [`navigate(${JSON.stringify(action.to)}${p ? `, ${p}` : ""});`];
    }
    case "openDialog": {
      store("openDialog");
      const p = params(action.params) ?? "{}";
      const onClose = Object.entries(action.onClose ?? {}).map(([result, list]) => {
        const body = statements(list, ctx, {
          ...sc,
          where: `${sc.where} / onClose.${result}`,
          dirty: true,
          fresh: true,
        });
        return `${propKey(result)}: ${handler("", body)}`;
      });
      return [
        `openDialog(${JSON.stringify(action.dialog)}, ${p}${onClose.length ? `, { ${onClose.join(", ")} }` : ""});`,
      ];
    }
    case "closeDialog":
      store("closeDialog");
      return [`closeDialog(${JSON.stringify(action.result ?? "ok")});`];
    case "back":
      ctx.nav.add("back");
      return ["back();"];
    case "setState":
      store("setUiState");
      return [`setUiState(${JSON.stringify(action.path)}, ${value(action.value, scope)});`];
    case "select":
      store("select");
      return [
        `select(${JSON.stringify(action.entity)}, ${action.id === null ? "null" : template(action.id, scope)});`,
      ];
    case "createRecord": {
      const nested = ctx.nest.has(action.entity);
      const values = value(action.values, scope);
      if (nested && action.parent !== undefined)
        return [
          `if (!${entityFn(ctx, "create", action.entity)}(${template(action.parent, scope)}, ${values}).ok) return;`,
        ];
      if (!nested && action.parent === undefined)
        return [`if (!${entityFn(ctx, "create", action.entity)}(${values}).ok) return;`];
      // 親の指定が合わない（プレビューと同じく、実行するとエラーになる）
      store("createRecord");
      const parent = action.parent !== undefined ? `, ${template(action.parent, scope)}` : "";
      return [
        `if (!createRecord(${JSON.stringify(action.entity)}, ${values}${parent}).ok) return;`,
      ];
    }
    case "updateRecord":
      return [
        `if (!${entityFn(ctx, "update", action.entity)}(${value(action.match, scope)}, ${value(action.set, scope)}).ok) return;`,
      ];
    case "deleteRecord":
      return [
        `if (!${entityFn(ctx, "delete", action.entity)}(${value(action.match, scope)}).ok) return;`,
      ];
    case "setDraft":
      if (!ctx.formEntity) return notFormStatements(ctx, "下書きがありません");
      ctx.usesForm = true;
      return [`form.setDraft(${JSON.stringify(action.field)}, ${value(action.value, scope)});`];
    case "saveDraft":
      if (!ctx.formEntity) return notFormStatements(ctx, "保存できません");
      ctx.usesForm = true;
      return ["if (!form.saveDraft()) return;"];
  }
}
