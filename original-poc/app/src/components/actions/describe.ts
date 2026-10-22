import type { Action, Project } from "@ui-editor/poc-model";

/** アクションを 1 行で説明する（一覧の表示用）。 */
export function describeAction(project: Project, a: Action): string {
  const name = (id: string) =>
    [...project.screens, ...project.dialogs].find((c) => c.id === id)?.name ?? id;
  const kv = (o: Record<string, unknown> | undefined) =>
    Object.entries(o ?? {})
      .map(([k, v]) => `${k} = ${typeof v === "string" ? v : JSON.stringify(v)}`)
      .join("、");
  const when = a.when ? `（when ${a.when}）` : "";
  switch (a.type) {
    case "navigate":
      return `画面遷移 → ${name(a.to)}${a.params ? `（${kv(a.params)}）` : ""}${when}`;
    case "openDialog":
      return `ダイアログを開く → ${name(a.dialog)}${a.params ? `（${kv(a.params)}）` : ""}${a.onClose ? `、閉じたら: ${Object.keys(a.onClose).join(" / ")}` : ""}${when}`;
    case "closeDialog":
      return `ダイアログを閉じる（${a.result ?? "ok"}）${when}`;
    case "back":
      return `戻る${when}`;
    case "setState":
      return `state.${a.path} = ${typeof a.value === "string" ? a.value : JSON.stringify(a.value)}${when}`;
    case "select":
      return `${a.entity} を選ぶ: ${a.id ?? "解除"}${when}`;
    case "createRecord":
      return `${a.entity} を作成（${kv(a.values)}）${a.parent ? `、親 ${a.parent}` : ""}${when}`;
    case "updateRecord":
      return `${a.entity} を更新: ${kv(a.match)} → ${kv(a.set)}${when}`;
    case "deleteRecord":
      return `${a.entity} を削除: ${kv(a.match)}${when}`;
    case "setDraft":
      return `下書きの ${a.field} = ${typeof a.value === "string" ? a.value : JSON.stringify(a.value)}${when}`;
    case "saveDraft":
      return `下書きを保存${when}`;
  }
}

/** 追加するアクションのひな形。 */
export function actionTemplate(project: Project, type: Action["type"]): Action {
  const entity = project.entities[0];
  const pk = entity?.primaryKey ?? "id";
  switch (type) {
    case "navigate":
      return { type, to: project.screens[0]?.id ?? "screen1" };
    case "openDialog":
      return { type, dialog: project.dialogs[0]?.id ?? "dialog1" };
    case "closeDialog":
      return { type, result: "ok" };
    case "back":
    case "saveDraft":
      return { type };
    case "setState":
      return { type, path: Object.keys(project.state)[0] ?? "value", value: "" };
    case "select":
      return { type, entity: entity?.id ?? "Entity", id: `{{ event.row.${pk} }}` };
    case "createRecord":
      return { type, entity: entity?.id ?? "Entity", values: {} };
    case "updateRecord":
      return { type, entity: entity?.id ?? "Entity", match: { [pk]: "" }, set: {} };
    case "deleteRecord":
      return { type, entity: entity?.id ?? "Entity", match: { [pk]: "" } };
    case "setDraft":
      return { type, field: "", value: "{{ event.value }}" };
  }
}
