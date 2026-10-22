import type { Project, Screen } from "@ui-editor/poc-model";
import { propKey } from "../names.js";
import type { ContainerInfo } from "./container.js";

/** ルート（1 画面 = 1 ルート）と、開いているダイアログを出す DialogHost。 */

const kebab = (id: string) =>
  id
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/_/g, "-")
    .toLowerCase();

/** 画面のパス（path が無ければ id から作る。ぶつかれば番号を付ける）。 */
export function screenPaths(project: Project): Map<string, string> {
  const taken = new Set(project.screens.flatMap((s) => (s.path ? [s.path] : [])));
  const out = new Map<string, string>();
  for (const s of project.screens) {
    if (s.path) {
      out.set(s.id, s.path);
      continue;
    }
    let path = `/${kebab(s.id)}`;
    for (let n = 2; taken.has(path); n++) path = `/${kebab(s.id)}-${n}`;
    taken.add(path);
    out.set(s.id, path);
  }
  return out;
}

/** src/model/screens.ts: 画面のパスとパラメータの型（URL の文字列から変換するのに使う）。 */
export function emitScreensModel(project: Project, paths: Map<string, string>): string {
  const entries = project.screens.map((s: Screen) => {
    const params = Object.entries(s.params ?? {}).map(
      ([k, def]) =>
        `${propKey(k)}: ${JSON.stringify(def.type === "number" || def.type === "boolean" ? def.type : "string")}`,
    );
    return `/** ${s.name} */\n${propKey(s.id)}: { path: ${JSON.stringify(paths.get(s.id))}, params: { ${params.join(", ")} } },`;
  });
  return `import type { ScreenName } from "./types";

export interface ScreenDef {
  /** ルートのパス（\`:name\` はパラメータ）。 */
  path: string;
  /** パラメータ → 型（パスとクエリ文字列の値を変換する）。 */
  params: Record<string, "string" | "number" | "boolean">;
}

/** 画面 id → パスとパラメータ。 */
export const SCREENS: Record<ScreenName, ScreenDef> = {
${entries.join("\n")}
};
`;
}

/** src/App.tsx: ルート。最初の画面（entry）は "/" から移る。 */
export function emitApp(
  project: Project,
  screens: readonly ContainerInfo[],
  paths: Map<string, string>,
): string {
  const entry = project.entry ?? project.screens[0]?.id;
  const entryPath = entry ? paths.get(entry) : undefined;
  const routes = screens.map(
    (s) =>
      `<Route path=${JSON.stringify(paths.get(s.container.id))} element={<${s.component} />} />`,
  );
  const hasRoot = [...paths.values()].includes("/");
  const canRedirect = entryPath !== undefined && !entryPath.includes(":");
  if (!hasRoot && canRedirect)
    routes.unshift(
      `<Route path="/" element={<Navigate to=${JSON.stringify(entryPath)} replace />} />`,
    );
  if (hasRoot || canRedirect)
    routes.push(`<Route path="*" element={<Navigate to="/" replace />} />`);
  const imports = screens.map((s) => `import { ${s.component} } from "./screens/${s.component}";`);
  const router = [
    "BrowserRouter",
    ...(hasRoot || canRedirect ? ["Navigate"] : []),
    "Route",
    "Routes",
  ];
  return `import { ${router.join(", ")} } from "react-router";
import { Layout } from "./Layout";
${imports.join("\n")}

/** 画面のルート（1 画面 = 1 ルート）。${entry ? `最初の画面は「${project.screens.find((s) => s.id === entry)?.name ?? entry}」。` : "画面がありません。"} */
export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
${routes.join("\n")}
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
`;
}

/** src/dialogs/DialogHost.tsx: 開いているダイアログを重ねて出す。 */
export function emitDialogHost(
  dialogs: readonly (ContainerInfo & { usesParams: boolean })[],
): string {
  if (dialogs.length === 0)
    return `/** 開いているダイアログを重ねて出す（このプロジェクトにはダイアログが無い）。 */
export function DialogHost() {
  return null;
}
`;
  const imports = dialogs.map((d) => `import { ${d.component} } from "./${d.component}";`);
  const cases = dialogs.map(
    (d) =>
      `case ${JSON.stringify(d.container.id)}:\nreturn <${d.component} key={dialog.key}${d.usesParams ? " params={dialog.params}" : ""} />;`,
  );
  return `import { useAppStore } from "../store/store";
${imports.join("\n")}

/** 開いているダイアログを重ねて出す（最後が最前面）。 */
export function DialogHost() {
  const dialogs = useAppStore((s) => s.dialogs);
  return (
    <>
      {dialogs.map((dialog) => {
        switch (dialog.name) {
${cases.join("\n")}
        }
      })}
    </>
  );
}
`;
}
