import type { Project } from "@ui-editor/schema";
import { writeAppTemplate } from "./app-template.js";
import { FileSet, type GeneratedFile } from "./files.js";
import { formatFile } from "./format.js";
import { screenName } from "./names.js";

export interface GenerateOptions {
  /** 生成するアプリのパッケージ名。 */
  appName: string;
}

/**
 * プロジェクト → アプリのソース一式。
 * 純粋な関数で、同じ入力からは常に同じファイル（パスの順）を返す。
 */
export async function generate(
  project: Project,
  options: GenerateOptions,
): Promise<GeneratedFile[]> {
  const files = new FileSet();
  writeAppTemplate(files, project, options);
  writeApp(files, project);
  for (const screen of project.screens) {
    files.add(
      `src/screens/${screenName(screen.id)}.tsx`,
      `export function ${screenName(screen.id)}() {
  return <h1>${jsxText(screen.name)}</h1>;
}
`,
    );
  }
  return Promise.all(
    files
      .toArray()
      .map(async (f) => ({ path: f.path, content: await formatFile(f.path, f.content) })),
  );
}

function writeApp(files: FileSet, project: Project) {
  const entry = project.screens.find((s) => s.id === project.entry) ?? project.screens[0]!;
  const name = screenName(entry.id);
  files.add(
    "src/App.tsx",
    `import { ${name} } from "./screens/${name}";

export function App() {
  return <${name} />;
}
`,
  );
}

/** JSX のテキストとして書けるようにエスケープする。 */
function jsxText(text: string): string {
  return /[{}<>]/.test(text) ? `{${JSON.stringify(text)}}` : text;
}
