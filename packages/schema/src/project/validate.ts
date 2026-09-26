import { checkTemplate } from "./binding.js";
import {
  BUILTIN_NODE_TYPES,
  ProjectSchema,
  type Action,
  type Events,
  type JsonValue,
  type Node,
  type ParamDef,
  type Project,
} from "./schema.js";

export type IssuePath = (string | number)[];

export interface ValidationIssue {
  /** 問題の箇所。例: `["screens", 0, "root", "children", 1, "type"]` */
  path: IssuePath;
  message: string;
}

export type ValidationResult =
  { success: true; project: Project } | { success: false; issues: ValidationIssue[] };

/** 形（zod）と参照（id の存在・重複など）の両方を検証する。 */
export function validateProject(input: unknown): ValidationResult {
  const parsed = ProjectSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      issues: parsed.error.issues.map((i) => ({
        path: i.path.map((p) => (typeof p === "symbol" ? String(p) : p)),
        message: i.message,
      })),
    };
  }
  const issues = checkReferences(parsed.data);
  return issues.length > 0 ? { success: false, issues } : { success: true, project: parsed.data };
}

export function formatIssue(issue: ValidationIssue): string {
  const path = issue.path.reduce<string>(
    (acc, p) => (typeof p === "number" ? `${acc}[${p}]` : acc ? `${acc}.${p}` : p),
    "",
  );
  return `${path || "(root)"}: ${issue.message}`;
}

/** 形が正しいプロジェクトに対して、参照の整合性を検証する。 */
export function checkReferences(project: Project): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const report = (path: IssuePath, message: string) => issues.push({ path, message });

  const screens = new Map(project.screens.map((s) => [s.id, s]));
  const dialogs = new Map((project.dialogs ?? []).map((d) => [d.id, d]));
  const components = new Map((project.components ?? []).map((c) => [c.id, c]));
  const collections = new Set(Object.keys(project.sampleData));
  const builtins = new Set<string>(BUILTIN_NODE_TYPES);
  const stateKeys = new Set(Object.keys(project.state ?? {}));

  // トップレベルの id の重複（画面・ダイアログ・コンポーネントで共通の名前空間）
  const topIds = new Map<string, IssuePath>();
  const checkTopId = (id: string, path: IssuePath) => {
    const prev = topIds.get(id);
    if (prev) report(path, `id "${id}" が重複しています（${prev.join(".")} と同じ）`);
    else topIds.set(id, path);
  };
  project.screens.forEach((s, i) => checkTopId(s.id, ["screens", i, "id"]));
  (project.dialogs ?? []).forEach((d, i) => checkTopId(d.id, ["dialogs", i, "id"]));
  (project.components ?? []).forEach((c, i) => {
    checkTopId(c.id, ["components", i, "id"]);
    if (builtins.has(c.id))
      report(["components", i, "id"], `"${c.id}" は組み込みの type と同じ名前です`);
  });

  if (project.entry !== undefined && !screens.has(project.entry)) {
    report(["entry"], `画面 "${project.entry}" がありません`);
  }

  const paths = new Map<string, number>();
  project.screens.forEach((s, i) => {
    const prev = paths.get(s.path);
    if (prev !== undefined)
      report(["screens", i, "path"], `path "${s.path}" が screens[${prev}] と重複しています`);
    else paths.set(s.path, i);
    for (const name of pathParams(s.path)) {
      if (!s.params?.[name])
        report(["screens", i, "path"], `path のパラメータ "${name}" が params にありません`);
    }
  });

  const checkArgs = (
    given: Record<string, JsonValue> | undefined,
    defs: Record<string, ParamDef> | undefined,
    path: IssuePath,
    what: string,
  ) => {
    for (const key of Object.keys(given ?? {})) {
      if (!defs?.[key]) report([...path, key], `${what} に "${key}" は定義されていません`);
    }
    for (const [key, def] of Object.entries(defs ?? {})) {
      if (def.default === undefined && given?.[key] === undefined) {
        report(path, `${what} の必須の "${key}" が指定されていません`);
      }
    }
  };

  const checkValue = (value: JsonValue, path: IssuePath) => {
    if (typeof value === "string") {
      const problem = checkTemplate(value);
      if (problem) report(path, problem);
    } else if (Array.isArray(value)) {
      value.forEach((v, i) => checkValue(v, [...path, i]));
    } else if (value !== null && typeof value === "object") {
      for (const [k, v] of Object.entries(value)) if (v !== undefined) checkValue(v, [...path, k]);
    }
  };

  const checkAction = (action: Action, path: IssuePath) => {
    switch (action.type) {
      case "navigate": {
        const target = screens.get(action.to);
        if (!target) report([...path, "to"], `画面 "${action.to}" がありません`);
        else
          checkArgs(
            action.params,
            target.params,
            [...path, "params"],
            `画面 "${action.to}" の params`,
          );
        if (action.params) checkValue(action.params, [...path, "params"]);
        break;
      }
      case "openDialog": {
        const target = dialogs.get(action.dialog);
        if (!target) report([...path, "dialog"], `ダイアログ "${action.dialog}" がありません`);
        else
          checkArgs(
            action.params,
            target.params,
            [...path, "params"],
            `ダイアログ "${action.dialog}" の params`,
          );
        if (action.params) checkValue(action.params, [...path, "params"]);
        break;
      }
      case "closeDialog":
        break;
      case "setState": {
        const root = action.path.split(".")[0] ?? "";
        if (!stateKeys.has(root))
          report([...path, "path"], `state に "${root}" が定義されていません`);
        checkValue(action.value, [...path, "value"]);
        break;
      }
      case "updateData":
        if (!collections.has(action.collection)) {
          report(
            [...path, "collection"],
            `sampleData にコレクション "${action.collection}" がありません`,
          );
        }
        checkValue(action.match, [...path, "match"]);
        checkValue(action.set, [...path, "set"]);
        break;
    }
  };

  const checkEvents = (events: Events | undefined, path: IssuePath) => {
    for (const [name, actions] of Object.entries(events ?? {})) {
      actions.forEach((a, i) => checkAction(a, [...path, name, i]));
    }
  };

  // ノード id は画面・ダイアログ・コンポーネントの中で一意
  const checkTree = (root: Node, rootPath: IssuePath) => {
    const seen = new Set<string>();
    const walk = (node: Node, path: IssuePath) => {
      if (seen.has(node.id)) report([...path, "id"], `ノード id "${node.id}" が重複しています`);
      seen.add(node.id);

      const component = components.get(node.type);
      if (component) {
        checkArgs(
          node.props,
          component.props,
          [...path, "props"],
          `コンポーネント "${node.type}" の props`,
        );
        if (node.children?.length)
          report([...path, "children"], "コンポーネントのノードは children を持てません");
      } else if (!builtins.has(node.type)) {
        report([...path, "type"], `type "${node.type}" は組み込みにもコンポーネントにもありません`);
      }

      if (node.props) checkValue(node.props, [...path, "props"]);
      if (node.style) checkValue(node.style as JsonValue, [...path, "style"]);
      if (node.repeat) checkValue(node.repeat as JsonValue, [...path, "repeat"]);
      if (typeof node.visible === "string") checkValue(node.visible, [...path, "visible"]);
      checkEvents(node.events, [...path, "events"]);
      node.children?.forEach((child, i) => walk(child, [...path, "children", i]));
    };
    walk(root, rootPath);
  };

  project.screens.forEach((s, i) => {
    checkEvents(s.events, ["screens", i, "events"]);
    checkTree(s.root, ["screens", i, "root"]);
  });
  (project.dialogs ?? []).forEach((d, i) => checkTree(d.root, ["dialogs", i, "root"]));
  (project.components ?? []).forEach((c, i) => {
    checkTree(c.root, ["components", i, "root"]);
    if (containsType(c.root, c.id))
      report(["components", i, "root"], `コンポーネント "${c.id}" が自分自身を含んでいます`);
  });
  for (const [key, def] of Object.entries(project.state ?? {})) {
    checkValue(def.initial, ["state", key, "initial"]);
  }

  return issues;
}

function pathParams(path: string): string[] {
  return [...path.matchAll(/:([A-Za-z_][A-Za-z0-9_]*)/g)].map((m) => m[1] ?? "");
}

function containsType(node: Node, type: string): boolean {
  return node.children?.some((c) => c.type === type || containsType(c, type)) ?? false;
}
