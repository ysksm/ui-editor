import type { Action, Project } from "@ui-editor/schema";
import { pathKey } from "./app.js";
import type { Scope } from "./binding.js";
import { valueExpr } from "./values.js";

/** アクションを実行するのに使う関数（ストアの関数や useNavigate など）。 */
export type ActionFunction = "navigate" | "openDialog" | "closeDialog" | "setState" | "updateData";

export interface ActionContext {
  project: Project;
  /** 使った関数。生成コードでフックを宣言するかどうかに使う。 */
  used: Set<ActionFunction>;
  /** ダイアログの中なら closeDialog は onClose() にする。 */
  inDialog: boolean;
}

/**
 * アクションの並び → 文の並び（順に実行する）。
 * scope には `event` が入っていること。
 */
export function actionStatements(
  actions: Action[],
  scope: Scope,
  ctx: ActionContext,
  where: string,
): string[] {
  return actions.map((action, i) => {
    const at = `${where}[${i}]`;
    switch (action.type) {
      case "navigate": {
        ctx.used.add("navigate");
        const params = action.params ? valueExpr(action.params, scope, `${at}.params`) : "";
        return `navigate(paths.${pathKey(action.to)}(${params}));`;
      }
      case "openDialog": {
        ctx.used.add("openDialog");
        const params = action.params
          ? `, params: ${valueExpr(action.params, scope, `${at}.params`)}`
          : "";
        return `openDialog({ id: ${JSON.stringify(action.dialog)}${params} });`;
      }
      case "closeDialog":
        if (ctx.inDialog) return "onClose();";
        ctx.used.add("closeDialog");
        return "closeDialog();";
      case "setState":
        ctx.used.add("setState");
        return `setState(${JSON.stringify(action.path)}, ${valueExpr(action.value, scope, `${at}.value`)});`;
      case "updateData":
        ctx.used.add("updateData");
        return `updateData(${JSON.stringify(action.collection)}, ${valueExpr(action.match, scope, `${at}.match`)}, ${valueExpr(action.set, scope, `${at}.set`)});`;
    }
  });
}

/** 文の並び → イベントハンドラ（アロー関数）。 */
export function arrowFunction(statements: string[], params: string): string {
  // `() => onClose()` は `onClose` と書ける
  if (statements.length === 1 && params === "" && /^\w+\(\);$/.test(statements[0]!)) {
    return statements[0]!.slice(0, -3);
  }
  if (statements.length === 1) return `(${params}) => ${statements[0]!.replace(/;$/, "")}`;
  return `(${params}) => {\n${statements.join("\n")}\n}`;
}

/** イベント名 → JSX の属性名。例: `rowClick` → `onRowClick` */
export function handlerName(event: string): string {
  return `on${event[0]!.toUpperCase()}${event.slice(1)}`;
}
