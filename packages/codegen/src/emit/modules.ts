import type { Component, Dialog, ParamDef, Project, Screen } from "@ui-editor/schema";
import type { FileSet } from "../files.js";
import { dialogName, screenName } from "../names.js";
import { CssModule } from "./css-module.js";
import { Imports } from "./imports.js";
import { referencedModelTypes } from "./model.js";
import { emitNode, type TreeContext } from "./tree.js";

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
  const { imports, css, jsx } = emitTree(screen.root, pc);
  const body = `export function ${name}() {
  return ${returned(jsx)};
}
`;
  writeModule(files, `src/screens/${name}`, imports, css, body);
}

export function writeComponent(files: FileSet, component: Component, pc: ProjectContext) {
  const name = component.id;
  const { imports, css, jsx } = emitTree(component.root, pc);
  const props = Object.entries(component.props ?? {});
  const defaults = props.filter(([, def]) => def.default !== undefined);
  importModelTypes(imports, props, pc);

  const propsType = `${name}Props`;
  const signature =
    defaults.length > 0
      ? `(input: ${propsType}) {
  const props = { ${defaults.map(([k, def]) => `${k}: ${JSON.stringify(def.default)}`).join(", ")}, ...input };`
      : props.length > 0
        ? `(props: ${propsType}) {`
        : `() {`;
  const body = `${props.length > 0 ? `export interface ${propsType} {\n${paramFields(props)}}\n\n` : ""}export function ${name}${signature}
  return ${returned(jsx)};
}
`;
  writeModule(files, `src/components/${name}`, imports, css, body);
}

export function writeDialog(files: FileSet, dialog: Dialog, pc: ProjectContext) {
  const name = dialogName(dialog.id);
  const { imports, css, jsx } = emitTree(dialog.root, pc);
  pc.ui.add("Dialog");
  imports.value("../ui/Dialog", "Dialog");
  const params = Object.entries(dialog.params ?? {});
  importModelTypes(imports, params, pc);

  const paramsType = `${name}Params`;
  const body = `${params.length > 0 ? `export interface ${paramsType} {\n${paramFields(params)}}\n\n` : ""}export interface ${name}Props {
  open: boolean;
  onClose: () => void;
${params.length > 0 ? `  params: ${paramsType};\n` : ""}}

export function ${name}({ open, onClose${params.length > 0 ? ", params" : ""} }: ${name}Props) {
  return (
    <Dialog open={open} onClose={onClose} label=${JSON.stringify(dialog.name)}>
      ${jsx}
    </Dialog>
  );
}
`;
  writeModule(files, `src/dialogs/${name}`, imports, css, body);
}

function emitTree(root: Screen["root"], pc: ProjectContext) {
  const ctx: TreeContext = {
    components: pc.components,
    imports: new Imports(),
    css: new CssModule(),
    srcDir: "..",
    ui: pc.ui,
  };
  const jsx = emitNode(root, ctx) ?? "null";
  return { imports: ctx.imports, css: ctx.css, jsx };
}

/** return 文の値。複数行の JSX は括弧で囲む。 */
function returned(jsx: string): string {
  return jsx.startsWith("<") ? `(\n${jsx}\n)` : jsx;
}

function writeModule(files: FileSet, base: string, imports: Imports, css: CssModule, body: string) {
  const file = base.split("/").pop()!;
  if (!css.isEmpty) {
    imports.default(`./${file}.module.css`, "styles");
    files.add(`${base}.module.css`, css.toString());
  }
  files.add(`${base}.tsx`, `${imports}${body}`);
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
