import { checkTemplate, extractExpressions } from "./binding.js";
import { NODE_EVENTS, RESERVED_STATE_KEYS, SELECTION_PATH } from "./builtins.js";
import { checkFieldFormat, checkFieldValue, isBlank, isRecord } from "./data.js";
import { extractTransitions } from "./flow.js";
import { entityMap, findField, nestParents } from "./er.js";
import { formatPath, type Issue, type IssuePath, type Severity } from "./issues.js";
import {
  BUILTIN_NODE_TYPES,
  type BuiltinNodeType,
  type Entity,
  type Field,
  type JsonValue,
  type ParamDef,
  type Project,
} from "./schema.js";
import { validateShape } from "./shape.js";
import { containers, walkActions, walkNodes, type ContainerRef } from "./walk.js";

export type ValidationResult =
  { success: true; project: Project; issues: Issue[] } | { success: false; issues: Issue[] };

/**
 * 形（zod）と参照・整合性を検証する。
 * 形が壊れていれば `success: false`（読み込めない）。参照の問題は `success: true` のまま `issues` に入る。
 */
export function validateProject(input: unknown): ValidationResult {
  const shape = validateShape(input);
  if (!shape.success) return shape;
  return { success: true, project: shape.project, issues: checkProject(shape.project) };
}

/** 形が正しいプロジェクトの参照・整合性を検証する（architecture.md 4.9）。 */
export function checkProject(project: Project): Issue[] {
  const issues: Issue[] = [];
  const report = (severity: Severity) => (path: IssuePath, message: string) =>
    issues.push({ path, message, severity });
  const ctx: Ctx = {
    project,
    entities: entityMap(project),
    error: report("error"),
    warning: report("warning"),
  };
  checkEntities(ctx);
  checkData(ctx);
  checkState(ctx);
  checkContainers(ctx);
  checkActions(ctx);
  checkFlow(ctx);
  checkLayout(ctx);
  return issues;
}

interface Ctx {
  project: Project;
  entities: Map<string, Entity>;
  error: (path: IssuePath, message: string) => void;
  warning: (path: IssuePath, message: string) => void;
}

/** 同じ id の 2 つ目以降を報告する。 */
function duplicateChecker(ctx: Ctx, what: string) {
  const seen = new Map<string, IssuePath>();
  return (id: string, path: IssuePath) => {
    const prev = seen.get(id);
    if (prev) ctx.error(path, `${what} "${id}" が重複しています（${formatPath(prev)} と同じ）`);
    else seen.set(id, path);
  };
}

// ---- ER ----

const STRING_FORMATS = new Set(["email", "url", "ipv4", "phone", "multiline"]);
const DATE_FORMATS = new Set(["date", "datetime"]);

function checkEntities(ctx: Ctx): void {
  const { project, entities } = ctx;
  const entityId = duplicateChecker(ctx, "エンティティ id");
  const nestedBy = new Map<string, IssuePath>();

  project.entities.forEach((e, i) => {
    const p: IssuePath = ["entities", i];
    entityId(e.id, [...p, "id"]);
    const fieldId = duplicateChecker(ctx, `${e.id} のフィールド id`);

    e.fields.forEach((f, j) => {
      const fp: IssuePath = [...p, "fields", j];
      fieldId(f.id, [...fp, "id"]);
      const unused = (key: keyof Field, why: string) => {
        if (f[key] !== undefined) ctx.warning([...fp, key], `${why}ので ${key} は使われません`);
      };
      if (f.type !== "enum") unused("values", "type が enum でない");
      if (f.type !== "ref" && f.type !== "children")
        unused("entity", "type が ref / children でない");
      if (f.type !== "ref") unused("onDelete", "type が ref でない");
      if (f.type !== "children") unused("cardinality", "type が children でない");
      if (f.type !== "number") {
        unused("min", "type が number でない");
        unused("max", "type が number でない");
      }
      if (f.format !== undefined) {
        const ok =
          (f.type === "string" && STRING_FORMATS.has(f.format)) ||
          (f.type === "date" && DATE_FORMATS.has(f.format));
        if (!ok) ctx.warning([...fp, "format"], `type ${f.type} に書式 ${f.format} は使えません`);
      }

      if (f.type === "id" && f.id !== e.primaryKey) {
        ctx.error([...fp, "type"], "type: id は主キーにだけ使えます");
      }
      if (f.type === "enum") {
        if (!f.values?.length) ctx.error([...fp, "values"], "enum には値（values）が必要です");
        else if (new Set(f.values).size !== f.values.length)
          ctx.error([...fp, "values"], "enum の値が重複しています");
      }
      if (f.type === "ref" || f.type === "children") {
        if (f.entity === undefined) {
          ctx.error([...fp, "entity"], "相手のエンティティ（entity）を指定してください");
        } else if (!entities.has(f.entity)) {
          ctx.error([...fp, "entity"], `エンティティ "${f.entity}" がありません`);
        }
      }
      if (f.type === "children") {
        if (f.required !== undefined) ctx.warning([...fp, "required"], "children では使われません");
        if (f.default !== undefined) ctx.warning([...fp, "default"], "children では使われません");
        if (f.entity !== undefined) {
          const prev = nestedBy.get(f.entity);
          if (prev) {
            ctx.error(
              [...fp, "entity"],
              `"${f.entity}" は既に ${formatPath(prev)} の入れ子です（入れ子の親は 1 つだけ。ほかからは ref で指してください）`,
            );
          } else {
            nestedBy.set(f.entity, fp);
          }
        }
      }
      if (f.default !== undefined) {
        const problem = checkFieldValue(f, f.default);
        if (problem) ctx.error([...fp, "default"], problem);
      }
      if (f.min !== undefined && f.max !== undefined && f.min > f.max) {
        ctx.error([...fp, "min"], "min が max より大きくなっています");
      }
    });

    const pk = findField(e, e.primaryKey);
    if (!pk) ctx.error([...p, "primaryKey"], `フィールド "${e.primaryKey}" がありません`);
    else if (pk.type !== "id")
      ctx.error([...p, "primaryKey"], "主キーのフィールドは type: id にしてください");
    if (e.displayField !== undefined) {
      const df = findField(e, e.displayField);
      if (!df) ctx.error([...p, "displayField"], `フィールド "${e.displayField}" がありません`);
      else if (df.type === "children")
        ctx.error([...p, "displayField"], "children のフィールドは表示に使えません");
    }
  });

  // 入れ子の循環（A の子が B、B の子が A）
  const parents = nestParents(project.entities);
  const reported = new Set<string>();
  for (const start of project.entities) {
    const chain = [start.id];
    let cur = parents.get(start.id);
    while (cur && !chain.includes(cur.parent)) {
      chain.push(cur.parent);
      cur = parents.get(cur.parent);
    }
    if (!cur || cur.parent !== start.id) continue;
    const key = [...chain].sort().join(",");
    if (reported.has(key)) continue;
    reported.add(key);
    const path = nestedBy.get(start.id) ?? ["entities"];
    ctx.error(path, `入れ子が循環しています（${[...chain].reverse().join(" → ")} → ${start.id}）`);
  }
}

// ---- データ ----

function checkData(ctx: Ctx): void {
  const { project, entities } = ctx;
  const parents = nestParents(project.entities);
  const primaryKeys = new Map<string, Map<string, IssuePath>>();
  const refs: { entity: string; value: string; path: IssuePath }[] = [];

  const checkRecord = (e: Entity, r: unknown, path: IssuePath): void => {
    if (!isRecord(r)) {
      ctx.error(path, "レコード（オブジェクト）ではありません");
      return;
    }
    for (const key of Object.keys(r)) {
      if (!findField(e, key))
        ctx.error([...path, key], `${e.id} にフィールド "${key}" はありません`);
    }
    for (const f of e.fields) {
      const v = r[f.id];
      const fp = [...path, f.id];
      if (f.type === "children") {
        const child = f.entity ? entities.get(f.entity) : undefined;
        if (!child || v === undefined) continue;
        if ((f.cardinality ?? "many") === "many") {
          if (!Array.isArray(v)) ctx.error(fp, "子のレコードの配列ではありません");
          else v.forEach((c, k) => checkRecord(child, c, [...fp, k]));
        } else if (v !== null) {
          if (!isRecord(v)) ctx.error(fp, "子のレコード（オブジェクト）か null ではありません");
          else checkRecord(child, v, fp);
        }
        continue;
      }
      const isPk = f.id === e.primaryKey;
      if ((isPk || f.required) && isBlank(v)) {
        ctx.error(fp, isPk ? "主キーがありません" : "必須の項目です");
        continue;
      }
      const problem = checkFieldValue(f, v);
      if (problem) {
        ctx.error(fp, problem);
        continue;
      }
      const format = checkFieldFormat(f, v);
      if (format) ctx.warning(fp, format);
      if (isPk && typeof v === "string") {
        let ids = primaryKeys.get(e.id);
        if (!ids) primaryKeys.set(e.id, (ids = new Map()));
        const prev = ids.get(v);
        if (prev) ctx.error(fp, `主キー "${v}" が重複しています（${formatPath(prev)} と同じ）`);
        else ids.set(v, fp);
      }
      if (f.type === "ref" && f.entity && typeof v === "string") {
        refs.push({ entity: f.entity, value: v, path: fp });
      }
    }
  };

  for (const [entityId, records] of Object.entries(project.data)) {
    const e = entities.get(entityId);
    if (!e) {
      ctx.error(["data", entityId], `エンティティ "${entityId}" がありません`);
      continue;
    }
    const nest = parents.get(entityId);
    if (nest) {
      ctx.error(
        ["data", entityId],
        `"${entityId}" は ${nest.parent}.${nest.field} の入れ子なので、data の直下には置けません`,
      );
      continue;
    }
    records.forEach((r, i) => checkRecord(e, r, ["data", entityId, i]));
  }
  for (const ref of refs) {
    if (entities.has(ref.entity) && !primaryKeys.get(ref.entity)?.has(ref.value)) {
      ctx.error(ref.path, `参照先の ${ref.entity} "${ref.value}" がありません`);
    }
  }
}

// ---- state ----

function checkState(ctx: Ctx): void {
  for (const key of RESERVED_STATE_KEYS) {
    if (key in ctx.project.state) {
      ctx.error(["state", key], `"${key}" は予約語です（プレビューのランタイムが管理します）`);
    }
  }
}

// ---- 画面・ダイアログ・ノード ----

const BUILTINS = new Set<string>(BUILTIN_NODE_TYPES);

function checkContainers(ctx: Ctx): void {
  const { project, entities } = ctx;
  const refs = containers(project);

  const id = duplicateChecker(ctx, "id");
  for (const ref of refs) id(ref.container.id, [...ref.path, "id"]);

  if (project.entry !== undefined) {
    const target = refs.find((r) => r.container.id === project.entry);
    if (!target) ctx.error(["entry"], `画面 "${project.entry}" がありません`);
    else if (target.kind === "dialog") ctx.error(["entry"], "entry には画面を指定してください");
  }

  const paths = new Map<string, number>();
  project.screens.forEach((s, i) => {
    if (s.path === undefined) return;
    const prev = paths.get(s.path);
    if (prev !== undefined)
      ctx.error(["screens", i, "path"], `path "${s.path}" が screens[${prev}] と重複しています`);
    else paths.set(s.path, i);
    for (const name of pathParams(s.path)) {
      if (!s.params?.[name])
        ctx.error(["screens", i, "path"], `path のパラメータ "${name}" が params にありません`);
    }
  });

  for (const ref of refs) {
    const c = ref.container;
    const p = ref.path;
    if (c.entity !== undefined && !entities.has(c.entity))
      ctx.error([...p, "entity"], `エンティティ "${c.entity}" がありません`);
    if (c.kind !== undefined && c.entity === undefined)
      ctx.warning([...p, "kind"], `役割 ${c.kind} にはエンティティ（entity）が要ります`);
    for (const [name, def] of Object.entries(c.params ?? {})) {
      checkParamDef(ctx, def, [...p, "params", name]);
    }
    if (c.root) checkTree(ctx, ref);
  }
}

function checkParamDef(ctx: Ctx, def: ParamDef, path: IssuePath): void {
  if (def.type === "ref") {
    if (def.entity === undefined)
      ctx.error([...path, "entity"], "type: ref には entity が必要です");
    else if (!ctx.entities.has(def.entity))
      ctx.error([...path, "entity"], `エンティティ "${def.entity}" がありません`);
  } else if (def.entity !== undefined) {
    ctx.warning([...path, "entity"], "type が ref でないので entity は使われません");
  }
}

function checkTree(ctx: Ctx, ref: ContainerRef): void {
  const nodeId = duplicateChecker(ctx, "ノード id");
  walkNodes(ref.container.root!, [...ref.path, "root"], (node, path) => {
    nodeId(node.id, [...path, "id"]);
    if (!BUILTINS.has(node.type)) {
      ctx.error(
        [...path, "type"],
        `type "${node.type}" は組み込みにありません（${BUILTIN_NODE_TYPES.join(" / ")}）`,
      );
    } else {
      const events = NODE_EVENTS[node.type as BuiltinNodeType];
      for (const event of Object.keys(node.events ?? {})) {
        if (!events.includes(event)) {
          ctx.warning(
            [...path, "events", event],
            `${node.type} はイベント "${event}" を発火しません（${events.join(" / ")}）`,
          );
        }
      }
    }
    if (node.props) checkValue(ctx, node.props, [...path, "props"]);
    if (node.style) checkValue(ctx, node.style as JsonValue, [...path, "style"]);
    if (node.repeat) checkValue(ctx, node.repeat as JsonValue, [...path, "repeat"]);
    if (typeof node.visible === "string") checkValue(ctx, node.visible, [...path, "visible"]);

    const props = node.props ?? {};
    if (node.type === "Button" && props.requires !== undefined) {
      checkRequires(ctx, props.requires, [...path, "props", "requires"]);
    }
    if (node.type === "Table") {
      if (props.entity !== undefined && !ctx.entities.has(String(props.entity)))
        ctx.error(
          [...path, "props", "entity"],
          `エンティティ "${String(props.entity)}" がありません`,
        );
      if (props.columns !== undefined && !Array.isArray(props.columns))
        ctx.error([...path, "props", "columns"], "列（{ header, value } の配列）ではありません");
    }
  });
}

function checkRequires(ctx: Ctx, value: JsonValue, path: IssuePath): void {
  if (typeof value !== "string") {
    ctx.error(path, "selection.<エンティティ> か state のパスを文字列で指定してください");
    return;
  }
  const m = SELECTION_PATH.exec(value);
  if (m) {
    if (!ctx.entities.has(m[1]!)) ctx.error(path, `エンティティ "${m[1]}" がありません`);
    return;
  }
  const root = value.split(".")[0] ?? "";
  if (!(root in ctx.project.state)) {
    ctx.error(path, `"${value}" は selection.<エンティティ> か state のパスで指定してください`);
  }
}

// ---- アクション ----

function checkActions(ctx: Ctx): void {
  const { project, entities } = ctx;
  const refs = new Map(containers(project).map((r) => [r.container.id, r]));
  const parents = nestParents(project.entities);

  const entityOf = (id: string, path: IssuePath): Entity | undefined => {
    const e = entities.get(id);
    if (!e) ctx.error(path, `エンティティ "${id}" がありません`);
    return e;
  };
  const fieldKeys = (e: Entity, obj: Record<string, JsonValue> | undefined, path: IssuePath) => {
    for (const key of Object.keys(obj ?? {})) {
      const f = findField(e, key);
      if (!f) ctx.error([...path, key], `${e.id} にフィールド "${key}" はありません`);
      else if (f.type === "children")
        ctx.error([...path, key], "children のフィールドはここでは指定できません");
    }
  };

  walkActions(project, ({ action, path, container }) => {
    if (action.when !== undefined) checkValue(ctx, action.when, [...path, "when"]);
    switch (action.type) {
      case "navigate":
      case "openDialog": {
        const toKey = action.type === "navigate" ? "to" : "dialog";
        const to = action.type === "navigate" ? action.to : action.dialog;
        const target = refs.get(to);
        const want = action.type === "navigate" ? "screen" : "dialog";
        if (!target) {
          ctx.error(
            [...path, toKey],
            `${want === "screen" ? "画面" : "ダイアログ"} "${to}" がありません`,
          );
        } else if (target.kind !== want) {
          ctx.error(
            [...path, toKey],
            want === "screen"
              ? `"${to}" はダイアログです（openDialog を使ってください）`
              : `"${to}" は画面です（navigate を使ってください）`,
          );
        } else {
          checkArgs(ctx, action.params, target.container.params, [...path, "params"], `"${to}"`);
        }
        if (action.params) checkValue(ctx, action.params, [...path, "params"]);
        break;
      }
      case "closeDialog":
        if (container.kind === "screen")
          ctx.warning(
            path,
            "画面の中の closeDialog は何もしません（ダイアログの中で使ってください）",
          );
        break;
      case "back":
        break;
      case "setState": {
        const root = action.path.split(".")[0] ?? "";
        if (root === "selection")
          ctx.error([...path, "path"], "selection は select アクションで変えてください");
        else if (!(root in project.state))
          ctx.error([...path, "path"], `state に "${root}" がありません`);
        checkValue(ctx, action.value, [...path, "value"]);
        break;
      }
      case "select":
        entityOf(action.entity, [...path, "entity"]);
        if (action.id !== null) checkValue(ctx, action.id, [...path, "id"]);
        break;
      case "createRecord": {
        const e = entityOf(action.entity, [...path, "entity"]);
        if (e) {
          fieldKeys(e, action.values, [...path, "values"]);
          const nest = parents.get(e.id);
          if (nest && action.parent === undefined)
            ctx.error(
              path,
              `"${e.id}" は ${nest.parent} の入れ子なので parent（親の主キー）が必要です`,
            );
          if (!nest && action.parent !== undefined)
            ctx.warning([...path, "parent"], "入れ子でないエンティティには parent は使われません");
        }
        checkValue(ctx, action.values, [...path, "values"]);
        if (action.parent !== undefined) checkValue(ctx, action.parent, [...path, "parent"]);
        break;
      }
      case "updateRecord": {
        const e = entityOf(action.entity, [...path, "entity"]);
        if (e) {
          fieldKeys(e, action.match, [...path, "match"]);
          fieldKeys(e, action.set, [...path, "set"]);
        }
        checkValue(ctx, action.match, [...path, "match"]);
        checkValue(ctx, action.set, [...path, "set"]);
        break;
      }
      case "deleteRecord": {
        const e = entityOf(action.entity, [...path, "entity"]);
        if (e) fieldKeys(e, action.match, [...path, "match"]);
        checkValue(ctx, action.match, [...path, "match"]);
        break;
      }
      case "setDraft":
      case "saveDraft": {
        const c = container.container;
        if (c.kind !== "form" || c.entity === undefined) {
          ctx.warning(
            path,
            `${action.type} はフォーム（kind: form と entity を持つ画面・ダイアログ）の中で使います`,
          );
        } else if (action.type === "setDraft") {
          const e = entities.get(c.entity);
          if (e && !findField(e, action.field))
            ctx.error([...path, "field"], `${e.id} にフィールド "${action.field}" はありません`);
          checkValue(ctx, action.value, [...path, "value"]);
        }
        break;
      }
    }
  });
}

/** 渡す値（params）が遷移先の定義と合っているか。 */
function checkArgs(
  ctx: Ctx,
  given: Record<string, JsonValue> | undefined,
  defs: Record<string, ParamDef> | undefined,
  path: IssuePath,
  target: string,
): void {
  for (const key of Object.keys(given ?? {})) {
    if (!defs?.[key]) ctx.error([...path, key], `${target} にパラメータ "${key}" はありません`);
  }
  for (const [key, def] of Object.entries(defs ?? {})) {
    if (def.required && given?.[key] === undefined) {
      ctx.warning(path, `${target} の必須のパラメータ "${key}" が渡されていません`);
    }
  }
}

// ---- 遷移の警告（FR-FLOW-06） ----

/**
 * 作りかけで普通に起きるので、どれも警告にする。
 * - どこからも遷移してこない画面（最初の画面は除く）
 * - どこからも呼ばれないダイアログ
 * - 仮の部品のままの遷移（D1 の案 b で、線を引いたときに置いた部品）
 */
function checkFlow(ctx: Ctx): void {
  const { project } = ctx;
  const transitions = extractTransitions(project);
  const reached = new Set(transitions.map((t) => t.to));
  const entry = project.entry ?? project.screens[0]?.id;
  project.screens.forEach((s, i) => {
    if (s.id !== entry && !reached.has(s.id))
      ctx.warning(["screens", i], `画面「${s.name}」にはどこからも遷移してきません`);
  });
  project.dialogs.forEach((d, i) => {
    if (!reached.has(d.id))
      ctx.warning(["dialogs", i], `ダイアログ「${d.name}」はどこからも呼ばれていません`);
  });
  for (const t of transitions) {
    if (!t.placeholder) continue;
    const what = t.label ? `「${t.label}」` : `"${t.node}"`;
    ctx.warning(
      t.path,
      `仮の部品${what}のままの遷移です（画面の中身を作るときに部品を決めてください）`,
    );
  }
}

// ---- 配置情報 ----

function checkLayout(ctx: Ctx): void {
  const ids = new Set(containers(ctx.project).map((r) => r.container.id));
  for (const id of Object.keys(ctx.project.layout?.flow ?? {})) {
    if (!ids.has(id)) ctx.warning(["layout", "flow", id], `画面・ダイアログ "${id}" がありません`);
  }
  for (const id of Object.keys(ctx.project.layout?.er ?? {})) {
    if (!ctx.entities.has(id))
      ctx.warning(["layout", "er", id], `エンティティ "${id}" がありません`);
  }
}

// ---- 値（`{{ }}`） ----

const ENTITY_IN_EXPRESSION = /\b(?:data|selection)\.([A-Z][A-Za-z0-9]*)/g;

/** JSON の値に含まれる文字列の `{{ }}` の対応と、式の中のエンティティ名を調べる。 */
function checkValue(ctx: Ctx, value: JsonValue, path: IssuePath): void {
  if (typeof value === "string") {
    const problem = checkTemplate(value);
    if (problem) {
      ctx.error(path, problem);
      return;
    }
    for (const expr of extractExpressions(value)) {
      for (const m of expr.matchAll(ENTITY_IN_EXPRESSION)) {
        if (!ctx.entities.has(m[1]!))
          ctx.warning(path, `式の中のエンティティ "${m[1]}" がありません（{{ ${expr} }}）`);
      }
    }
  } else if (Array.isArray(value)) {
    value.forEach((v, i) => checkValue(ctx, v, [...path, i]));
  } else if (value !== null && typeof value === "object") {
    for (const [k, v] of Object.entries(value))
      if (v !== undefined) checkValue(ctx, v, [...path, k]);
  }
}

function pathParams(path: string): string[] {
  return [...path.matchAll(/:([A-Za-z_][A-Za-z0-9_]*)/g)].map((m) => m[1] ?? "");
}
