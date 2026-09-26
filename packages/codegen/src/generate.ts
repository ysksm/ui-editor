import type { Project } from "@ui-editor/schema";
import { writeAppTemplate } from "./app-template.js";
import { modelSource, modelTypeNames } from "./emit/model.js";
import { writeComponent, writeDialog, writeScreen, type ProjectContext } from "./emit/modules.js";
import { writeUi } from "./emit/ui.js";
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
  const pc: ProjectContext = {
    project,
    components: new Map((project.components ?? []).map((c) => [c.id, c])),
    modelTypes: modelTypeNames(project),
    ui: new Set(),
  };

  writeAppTemplate(files, project, options);
  writeApp(files, project);
  const model = modelSource(project);
  if (model !== undefined) files.add("src/model.ts", model);
  for (const screen of project.screens) writeScreen(files, screen, pc);
  for (const component of project.components ?? []) writeComponent(files, component, pc);
  for (const dialog of project.dialogs ?? []) writeDialog(files, dialog, pc);
  writeUi(files, pc.ui);

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
