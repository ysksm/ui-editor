import type { Project } from "@ui-editor/schema";
import type { FileSet } from "../files.js";
import { camelCase, dialogName, screenName } from "../names.js";

/** 画面 id → paths のキー。 */
export function pathKey(screenId: string): string {
  return camelCase(screenId);
}

function entryScreen(project: Project) {
  return project.screens.find((s) => s.id === project.entry) ?? project.screens[0]!;
}

/** src/App.tsx: ルーター・画面・ダイアログをまとめる。 */
export function writeApp(files: FileSet, project: Project) {
  const hasDialogs = (project.dialogs ?? []).length > 0;
  files.add(
    "src/App.tsx",
    `import { BrowserRouter } from "react-router";
${hasDialogs ? `import { DialogHost } from "./dialogs/DialogHost";\n` : ""}import { AppRoutes } from "./routes";

export function App() {
  return (
    <BrowserRouter>
      <AppRoutes />
${hasDialogs ? "      <DialogHost />\n" : ""}    </BrowserRouter>
  );
}
`,
  );
}

/** src/paths.ts: 画面 id → URL を作る関数。navigate で使う。 */
export function writePaths(files: FileSet, project: Project) {
  const imports = project.screens
    .filter((s) => Object.keys(s.params ?? {}).length > 0)
    .map((s) => `import type { ${screenName(s.id)}Params } from "./screens/${screenName(s.id)}";\n`)
    .join("");
  const entries = project.screens.map((s) => {
    const params = Object.entries(s.params ?? {});
    const url = s.path.replace(/:([A-Za-z_][A-Za-z0-9_]*)/g, (_, name: string) => {
      const type = s.params?.[name]?.type;
      const value = type === "string" ? `params.${name}` : `String(params.${name})`;
      return `\${encodeURIComponent(${value})}`;
    });
    const arg = params.length > 0 ? `params: ${screenName(s.id)}Params` : "";
    const body = url === s.path ? JSON.stringify(url) : `\`${url}\``;
    return `  /** ${s.name} */\n  ${pathKey(s.id)}: (${arg}) => ${body},\n`;
  });
  files.add(
    "src/paths.ts",
    `${imports}${imports ? "\n" : ""}/** 画面の URL。例: \`navigate(paths.${pathKey(project.screens[0]!.id)}())\` */
export const paths = {
${entries.join("")}};
`,
  );
}

/** src/routes.tsx: ルート定義（1 画面 = 1 ルート）。 */
export function writeRoutes(files: FileSet, project: Project) {
  const entry = entryScreen(project);
  const entryHasParams = Object.keys(entry.params ?? {}).length > 0;
  const hasRoot = project.screens.some((s) => s.path === "/");
  const screenImports = project.screens
    .map((s) => screenName(s.id))
    .sort()
    .map((n) => `import { ${n} } from "./screens/${n}";\n`)
    .join("");
  const routes = project.screens.map(
    (s) => `      <Route path=${JSON.stringify(s.path)} element={<${screenName(s.id)} />} />\n`,
  );
  // 最初の画面（entry）が / でなければ / から移動する。どれにも当たらない URL も最初の画面へ
  const redirect = `<Navigate to={paths.${pathKey(entry.id)}()} replace />`;
  if (!entryHasParams && !hasRoot) routes.push(`      <Route path="/" element={${redirect}} />\n`);
  if (!entryHasParams) routes.push(`      <Route path="*" element={${redirect}} />\n`);
  const usesPaths = !entryHasParams;
  files.add(
    "src/routes.tsx",
    `import { ${usesPaths ? "Navigate, " : ""}Route, Routes } from "react-router";
${usesPaths ? `import { paths } from "./paths";\n` : ""}${screenImports}
export function AppRoutes() {
  return (
    <Routes>
${routes.join("")}    </Routes>
  );
}
`,
  );
}

/** src/dialogs/DialogHost.tsx: ストアで開いているダイアログを描画する。 */
export function writeDialogHost(files: FileSet, project: Project) {
  const dialogs = project.dialogs ?? [];
  if (dialogs.length === 0) return;
  const imports = dialogs
    .map((d) => dialogName(d.id))
    .sort()
    .map((n) => `import { ${n} } from "./${n}";\n`)
    .join("");
  const cases = dialogs.map((d) => {
    const params = Object.keys(d.params ?? {}).length > 0 ? " params={dialog.params}" : "";
    return `    case ${JSON.stringify(d.id)}:
      return <${dialogName(d.id)} open onClose={closeDialog}${params} />;
`;
  });
  files.add(
    "src/dialogs/DialogHost.tsx",
    `import { useAppStore } from "../store/appStore";
${imports}
/** 開いているダイアログ（同時に 1 つ）を描画する。開閉はストアの openDialog / closeDialog で行う。 */
export function DialogHost() {
  const dialog = useAppStore((store) => store.dialog);
  const closeDialog = useAppStore((store) => store.closeDialog);

  switch (dialog?.id) {
${cases.join("")}    default:
      return null;
  }
}
`,
  );
}
