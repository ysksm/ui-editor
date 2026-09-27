// P3（apps/editor-craft）のエディタを書き換えずに import して使う
import { App } from "@ui-editor/editor-craft/src/App";
import { EXAMPLE_FILENAME, loadExampleProject } from "@ui-editor/editor-craft/src/project/example";

export function DesktopApp() {
  return <App initialProject={loadExampleProject()} initialFilename={EXAMPLE_FILENAME} />;
}
