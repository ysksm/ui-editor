import type { Component, Dialog, Node, ParamDef, Project, Screen } from "@ui-editor/schema";
import type { FileSet } from "../files.js";
import { dialogName, screenName } from "../names.js";
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
}

export function writeScreen(files: FileSet, screen: Screen, pc: ProjectContext) {
  const name = screenName(screen.id);
  const params = Object.entries(screen.params ?? {});
  const tree = emitTree(
    screen.root,
    `screens.${screen.id}`,
    params.length > 0 ? ["params"] : [],
    pc,
  );
  importModelTypes(tree.imports, params, pc);

  const paramsType = `${name}Params`;
  const body = `${params.length > 0 ? `export interface ${paramsType} {\n${paramFields(params)}}\n\n` : ""}export function ${name}(${params.length > 0 ? `{ params }: { params: ${paramsType} }` : ""}) {
${tree.hooks}  return ${returned(tree.jsx)};
}
`;
  writeModule(files, `src/screens/${name}`, tree, body);
}

export function writeComponent(files: FileSet, component: Component, pc: ProjectContext) {
  const name = component.id;
  const props = Object.entries(component.props ?? {});
  const tree = emitTree(component.root, `components.${name}`, ["props"], pc);
  importModelTypes(tree.imports, props, pc);

  const usesProps = tree.scope.used.has("props");
  const defaults = props.filter(([, def]) => def.default !== undefined);
  const propsType = `${name}Props`;
  const signature = !usesProps
    ? props.length > 0
      ? `(_props: ${propsType}) {`
      : `() {`
    : defaults.length > 0
      ? `(input: ${propsType}) {
  const props = { ${defaults.map(([k, def]) => `${k}: ${JSON.stringify(def.default)}`).join(", ")}, ...input };`
      : `(props: ${propsType}) {`;
  const body = `${props.length > 0 ? `export interface ${propsType} {\n${paramFields(props)}}\n\n` : ""}export function ${name}${signature}
${tree.hooks}  return ${returned(tree.jsx)};
}
`;
  writeModule(files, `src/components/${name}`, tree, body);
}

export function writeDialog(files: FileSet, dialog: Dialog, pc: ProjectContext) {
  const name = dialogName(dialog.id);
  const params = Object.entries(dialog.params ?? {});
  const tree = emitTree(
    dialog.root,
    `dialogs.${dialog.id}`,
    params.length > 0 ? ["params"] : [],
    pc,
  );
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
  jsx: string;
}

/**
 * ツリーを JSX にする。式から参照できる名前は `data` / `state` と locals（`params` / `props`）。
 * 実際に参照された `data` / `state` だけストアから読む。
 */
function emitTree(root: Node, owner: string, locals: string[], pc: ProjectContext): EmittedTree {
  const scope = new Scope(["data", "state", ...locals]);
  const ctx: TreeContext = {
    components: pc.components,
    imports: new Imports(),
    css: new CssModule(),
    srcDir: "..",
    ui: pc.ui,
    owner,
  };
  const jsx = rootJsx(emitNode(root, ctx, scope));
  const hooks = ["data", "state"]
    .filter((name) => scope.used.has(name))
    .map((name) => `  const ${name} = useAppStore((store) => store.${name});\n`)
    .join("");
  if (hooks) ctx.imports.value("../store/appStore", "useAppStore");
  return { imports: ctx.imports, css: ctx.css, scope, hooks: hooks ? `${hooks}\n` : "", jsx };
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
