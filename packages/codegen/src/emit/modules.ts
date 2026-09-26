import type { Component, Dialog, Node, ParamDef, Project, Screen } from "@ui-editor/schema";
import type { FileSet } from "../files.js";
import { dialogName, screenName } from "../names.js";
import { actionStatements, handlerName, type ActionContext } from "./actions.js";
import { Scope } from "./binding.js";
import { CssModule } from "./css-module.js";
import { Imports } from "./imports.js";
import { referencedModelTypes } from "./model.js";
import { emitNode, rootJsx, type TreeContext } from "./tree.js";

/** プロジェクト全体で共有する情報。 */
export interface ProjectContext {
  project: Project;
  components: ReadonlyMap<string, Component>;
  modelTypes: readonly string[];
  /** 使った src/ui/ のファイル名。 */
  ui: Set<string>;
  /** コンポーネント名 → インスタンスに付いているイベント名（props で受け取る）。 */
  componentEvents: ReadonlyMap<string, readonly string[]>;
}

export function writeScreen(files: FileSet, screen: Screen, pc: ProjectContext) {
  const name = screenName(screen.id);
  const params = Object.entries(screen.params ?? {});
  const paramsType = `${name}Params`;
  const tree = emitTree(screen.root, `screens.${screen.id}`, pc, {
    locals: params.length > 0 ? ["params"] : [],
    // 画面を開いたとき（mount）のアクション。params が変わったとき（別の機器を開いたなど）も実行する
    before: (scope, actions) => {
      const mount = screen.events?.mount ?? [];
      if (mount.length === 0) return "";
      const statements = actionStatements(
        mount,
        scope.child(["event"]),
        actions,
        `screens.${screen.id} の events.mount`,
      );
      const deps = params.map(([key]) => `params.${key}`).join(", ");
      if (params.length > 0) scope.resolve("params");
      return `  // 画面を開いたとき
  useEffect(() => {
${statements.map((st) => `    ${st}\n`).join("")}  }, [${deps}]);\n\n`;
    },
  });
  importModelTypes(tree.imports, params, pc);
  if (tree.body.includes("useEffect(")) tree.imports.value("react", "useEffect");
  if (tree.scope.used.has("params")) tree.imports.value("react-router", "useParams");

  const paramsHook = tree.scope.used.has("params")
    ? `  // ルートの ${params.map(([k]) => `:${k}`).join(" / ")}
  const { ${params.map(([k]) => `${k} = ""`).join(", ")} } = useParams();
  const params: ${paramsType} = { ${params.map(([k, def]) => fromUrl(k, def.type)).join(", ")} };\n`
    : "";
  const body = `${params.length > 0 ? `export interface ${paramsType} {\n${paramFields(params)}}\n\n` : ""}export function ${name}() {
${paramsHook}${tree.hooks}${tree.body}  return ${returned(tree.jsx)};
}
`;
  writeModule(files, `src/screens/${name}`, tree, body);
}

export function writeComponent(files: FileSet, component: Component, pc: ProjectContext) {
  const name = component.id;
  const props = Object.entries(component.props ?? {});
  const forwardEvents = pc.componentEvents.get(name) ?? [];
  const tree = emitTree(component.root, `components.${name}`, pc, {
    locals: ["props"],
    forwardEvents,
  });
  importModelTypes(tree.imports, props, pc);

  const usesProps = tree.scope.used.has("props");
  const defaults = props.filter(([, def]) => def.default !== undefined);
  const propsType = `${name}Props`;
  const hasProps = props.length > 0 || forwardEvents.length > 0;
  const signature = !usesProps
    ? hasProps
      ? `(_props: ${propsType}) {`
      : `() {`
    : defaults.length > 0
      ? `(input: ${propsType}) {
  const props = { ${defaults.map(([k, def]) => `${k}: ${JSON.stringify(def.default)}`).join(", ")}, ...input };`
      : `(props: ${propsType}) {`;
  const eventFields = forwardEvents.map((e) => `  ${handlerName(e)}?: () => void;\n`).join("");
  const body = `${hasProps ? `export interface ${propsType} {\n${paramFields(props)}${eventFields}}\n\n` : ""}export function ${name}${signature}
${tree.hooks}  return ${returned(tree.jsx)};
}
`;
  writeModule(files, `src/components/${name}`, tree, body);
}

export function writeDialog(files: FileSet, dialog: Dialog, pc: ProjectContext) {
  const name = dialogName(dialog.id);
  const params = Object.entries(dialog.params ?? {});
  const tree = emitTree(dialog.root, `dialogs.${dialog.id}`, pc, {
    locals: params.length > 0 ? ["params"] : [],
    inDialog: true,
  });
  pc.ui.add("Dialog");
  tree.imports.value("../ui/Dialog", "Dialog");
  importModelTypes(tree.imports, params, pc);

  const usesParams = tree.scope.used.has("params");
  const paramsType = `${name}Params`;
  const body = `${params.length > 0 ? `export interface ${paramsType} {\n${paramFields(params)}}\n\n` : ""}export interface ${name}Props {
  open: boolean;
  onClose: () => void;
${params.length > 0 ? `  params: ${paramsType};\n` : ""}}

export function ${name}({ open, onClose${usesParams ? ", params" : ""} }: ${name}Props) {
${tree.hooks}  return (
    <Dialog open={open} onClose={onClose} label=${JSON.stringify(dialog.name)}>
      ${tree.jsx}
    </Dialog>
  );
}
`;
  writeModule(files, `src/dialogs/${name}`, tree, body);
}

interface EmittedTree {
  imports: Imports;
  css: CssModule;
  scope: Scope;
  /** 関数の先頭に置く宣言（ストアから読む値など）。 */
  hooks: string;
  /** hooks の後、return の前に置くコード（useEffect など）。 */
  body: string;
  jsx: string;
}

interface TreeOptions {
  /** 式から参照できる名前（`data` / `state` 以外）。 */
  locals: string[];
  inDialog?: boolean;
  forwardEvents?: readonly string[];
  /** ツリーとは別に生成するコード。ここで使った名前もフックの宣言に反映する。 */
  before?: (scope: Scope, actions: ActionContext) => string;
}

/** 実際に使ったものだけ宣言する。並びは固定。 */
const STORE_VALUES = ["data", "state"] as const;
const STORE_FUNCTIONS = ["openDialog", "closeDialog", "setState", "updateData"] as const;

/**
 * ツリーを JSX にする。式から参照できる名前は `data` / `state` と locals（`params` / `props`）。
 * 実際に参照された値・使ったアクションの関数だけ、ストアや useNavigate から取り出す。
 */
function emitTree(root: Node, owner: string, pc: ProjectContext, opts: TreeOptions): EmittedTree {
  const scope = new Scope(["data", "state", ...opts.locals]);
  const actions: ActionContext = {
    project: pc.project,
    used: new Set(),
    inDialog: opts.inDialog ?? false,
  };
  const ctx: TreeContext = {
    components: pc.components,
    imports: new Imports(),
    css: new CssModule(),
    srcDir: "..",
    ui: pc.ui,
    owner,
    actions,
    root: opts.forwardEvents ? { node: root, forwardEvents: opts.forwardEvents } : undefined,
  };
  const jsx = rootJsx(emitNode(root, ctx, scope));
  const body = opts.before?.(scope, actions) ?? "";

  const lines: string[] = [];
  if (actions.used.has("navigate")) {
    ctx.imports.value("react-router", "useNavigate").value("../paths", "paths");
    lines.push("  const navigate = useNavigate();\n");
  }
  for (const name of [
    ...STORE_VALUES.filter((n) => scope.used.has(n)),
    ...STORE_FUNCTIONS.filter((n) => actions.used.has(n)),
  ]) {
    ctx.imports.value("../store/appStore", "useAppStore");
    lines.push(`  const ${name} = useAppStore((store) => store.${name});\n`);
  }
  const hooks = lines.length > 0 ? `${lines.join("")}\n` : "";
  return { imports: ctx.imports, css: ctx.css, scope, hooks, body, jsx };
}

/** return 文の値。複数行の JSX は括弧で囲む。 */
function returned(jsx: string): string {
  return jsx.startsWith("<") ? `(\n${jsx}\n)` : jsx;
}

function writeModule(files: FileSet, base: string, tree: EmittedTree, body: string) {
  const file = base.split("/").pop()!;
  if (!tree.css.isEmpty) {
    tree.imports.default(`./${file}.module.css`, "styles");
    files.add(`${base}.module.css`, tree.css.toString());
  }
  files.add(`${base}.tsx`, `${tree.imports}${body}`);
}

function paramFields(params: [string, ParamDef][]): string {
  return params
    .map(([key, def]) => `  ${key}${def.default !== undefined ? "?" : ""}: ${def.type};\n`)
    .join("");
}

function importModelTypes(imports: Imports, params: [string, ParamDef][], pc: ProjectContext) {
  const types = params.flatMap(([, def]) => referencedModelTypes(def.type, pc.modelTypes));
  if (types.length > 0) imports.type("../model", ...types);
}

/** URL の文字列 → params の型の値。 */
function fromUrl(key: string, type: string): string {
  if (type === "string") return key;
  if (type === "number") return `${key}: Number(${key})`;
  if (type === "boolean") return `${key}: ${key} === "true"`;
  return `${key}: ${key} as unknown as ${type}`;
}
