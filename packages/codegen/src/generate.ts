import type { Project } from "@ui-editor/schema";
import type { Node } from "@ui-editor/schema";
import { writeAppTemplate } from "./app-template.js";
import { writeApp, writeDialogHost, writePaths, writeRoutes } from "./emit/app.js";
import { modelSource, modelTypeNames } from "./emit/model.js";
import { writeComponent, writeDialog, writeScreen, type ProjectContext } from "./emit/modules.js";
import { writeRtkStore } from "./emit/store-rtk.js";
import { writeStore } from "./emit/store.js";
import { writeUi } from "./emit/ui.js";
import { FileSet, type GeneratedFile } from "./files.js";
import { formatFile } from "./format.js";

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
    componentEvents: componentEvents(project),
  };

  writeAppTemplate(files, project, options);
  writeApp(files, project);
  writePaths(files, project);
  writeRoutes(files, project);
  writeDialogHost(files, project);
  const model = modelSource(project);
  if (model !== undefined) files.add("src/model.ts", model);
  writeStore(files, project, pc.modelTypes);
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

/** コンポーネント名 → インスタンスに付いているイベント名（アルファベット順）。 */
function componentEvents(project: Project): Map<string, string[]> {
  const names = new Set((project.components ?? []).map((c) => c.id));
  const out = new Map<string, Set<string>>();
  const walk = (node: Node) => {
    if (names.has(node.type)) {
      const set = out.get(node.type) ?? new Set<string>();
      for (const e of Object.keys(node.events ?? {})) set.add(e);
      out.set(node.type, set);
    }
    node.children?.forEach(walk);
  };
  for (const owner of [
    ...project.screens,
    ...(project.components ?? []),
    ...(project.dialogs ?? []),
  ]) {
    walk(owner.root);
  }
  return new Map([...out].map(([k, v]) => [k, [...v].sort()]));
}

/**
 * ストア部分だけを Redux Toolkit で書いたもの（Zustand 版との比較用、#12）。
 * 返すのは src/store/appStore.ts だけで、アプリには組み込まない。
 */
export async function generateRtkStore(project: Project): Promise<GeneratedFile[]> {
  const files = new FileSet();
  writeRtkStore(files, project, modelTypeNames(project));
  return Promise.all(
    files
      .toArray()
      .map(async (f) => ({ path: f.path, content: await formatFile(f.path, f.content) })),
  );
}
