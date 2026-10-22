import {
  findContainer,
  generateScreens,
  type GenerateOptions,
  type GenerateResult,
} from "@ui-editor/poc-model";
import type { EditorStore } from "../state/store";

/** ER から画面・遷移を生成し、作ったものを通知に出す。 */
export function generateFor(
  store: EditorStore,
  entityId: string,
  options: GenerateOptions = {},
): GenerateResult {
  let result: GenerateResult = {};
  const ok = store
    .getState()
    .edit("画面を生成", (d) => void (result = generateScreens(d, entityId, options)));
  if (ok) {
    const project = store.getState().project;
    const names = Object.values(result)
      .map((id) => findContainer(project, id)?.container.name ?? id)
      .join("、");
    store.getState().setNotice({
      kind: "info",
      text: names
        ? `${names} を作りました（フロー・画面・プレビューで確かめられます）`
        : "作るものが選ばれていません",
    });
  }
  return result;
}
