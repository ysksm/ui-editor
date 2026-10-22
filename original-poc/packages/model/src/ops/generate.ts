import { nestParents } from "../er.js";
import type { Action, Container, Entity, Kind, Node, Project } from "../schema.js";
import { containers, findNode, walkNodes, type ContainerRef } from "../walk.js";
import { addContainer, setEntry } from "./containers.js";
import { lowerFirst, pluralize, uniqueId } from "./ids.js";
import { applyTemplate, recordParamName } from "./templates.js";

/**
 * ER からの画面・遷移の生成（FR-GEN-01〜03）。テンプレート（applyTemplate）で中身を作り、
 * 遷移は仮の部品ではなく本物の部品（ボタン・表の行クリック）で結ぶ。
 *
 * | 作るもの | 中身と遷移 |
 * | --- | --- |
 * | 一覧（画面） | 表の行クリック → 詳細、「新規」→ フォーム（入れ子のエンティティには無い）、選択＋「編集」→ フォーム、選択＋「削除」→ 削除の確認（入れ子には無い） |
 * | 詳細（画面） | 「編集」→ フォーム、「削除」→ 削除の確認、「一覧へ戻る」。子の一覧の行 → 子の詳細、「〈子〉を追加」→ 子のフォーム |
 * | フォーム（ダイアログ） | 保存・キャンセル（テンプレート） |
 * | 削除の確認（ダイアログ） | 削除する → 閉じる → 一覧へ（入れ子のエンティティは前の画面へ戻る） |
 */
export interface GenerateOptions {
  list?: boolean;
  detail?: boolean;
  form?: boolean;
  confirm?: boolean;
}

export interface GenerateResult {
  list?: string;
  detail?: string;
  form?: string;
  confirm?: string;
}

function kebab(id: string): string {
  return id.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();
}

/** その役割とエンティティの画面・ダイアログ（最初のもの）。 */
export function findGenerated(
  project: Project,
  kind: Kind,
  entity: string,
): ContainerRef | undefined {
  return containers(project).find(
    (c) => c.container.kind === kind && c.container.entity === entity,
  );
}

function nodeIds(c: Container): string[] {
  const ids: string[] = [];
  if (c.root) walkNodes(c.root, [], (n) => ids.push(n.id));
  return ids;
}

/** 操作ボタンの並び（toolbar）に本物のボタンを足す。無ければ作る（一覧はタイトルの下、ほかは末尾）。 */
function addButton(
  c: Container,
  spec: { id: string; label: string; variant?: string; requires?: string; actions: Action[] },
): string {
  const root = c.root!;
  let toolbar = findNode(root, "toolbar");
  if (!toolbar) {
    toolbar = { id: "toolbar", type: "Box", props: { direction: "row", gap: 8 }, children: [] };
    if (c.kind === "list") root.children!.splice(1, 0, toolbar);
    else root.children!.push(toolbar);
  }
  const id = uniqueId(spec.id, nodeIds(c));
  toolbar.children ??= [];
  toolbar.children.push({
    id,
    type: "Button",
    props: {
      label: spec.label,
      ...(spec.variant ? { variant: spec.variant } : {}),
      ...(spec.requires ? { requires: spec.requires } : {}),
    },
    events: { click: spec.actions },
  });
  return id;
}

function addEvent(node: Node, event: string, actions: Action[]): void {
  node.events ??= {};
  node.events[event] = [...(node.events[event] ?? []), ...actions];
}

/**
 * エンティティから画面・ダイアログと遷移を作り、作った id を返す。既にある id とぶつかれば番号を付ける。
 * 入れ子の親・子の画面が既にあれば、そことも結ぶ（親の詳細の子の一覧 → この詳細・この追加フォーム）。
 */
export function generateScreens(
  draft: Project,
  entityId: string,
  options: GenerateOptions = {},
): GenerateResult {
  const entity = draft.entities.find((e) => e.id === entityId);
  if (!entity) throw new Error(`エンティティ "${entityId}" がありません`);
  const want = { list: true, detail: true, form: true, confirm: true, ...options };
  const nest = nestParents(draft.entities).get(entity.id);
  const pk = entity.primaryKey;
  const param = recordParamName(entity.id);
  const base = lowerFirst(entity.id);
  const plural = pluralize(base);
  const taken = () => containers(draft).map((c) => c.container.id);
  const hadScreens = draft.screens.length > 0;
  const out: GenerateResult = {};

  const make = (kind: "screen" | "dialog", id: string, name: string, k: Kind, path?: string) => {
    const created = addContainer(draft, kind, { id: uniqueId(id, taken()), name });
    if (path) {
      const s = draft.screens.find((x) => x.id === created)!;
      s.path = path;
    }
    applyTemplate(draft, created, { kind: k, entity: entity.id });
    return created;
  };
  if (want.list)
    out.list = make("screen", plural, `${entity.name}一覧`, "list", `/${kebab(plural)}`);
  if (want.detail)
    out.detail = make(
      "screen",
      `${base}Detail`,
      `${entity.name}詳細`,
      "detail",
      `/${kebab(plural)}/:${param}`,
    );
  if (want.form) out.form = make("dialog", `${base}Form`, `${entity.name}の編集`, "form");
  if (want.confirm)
    out.confirm = make("dialog", `${base}Delete`, `${entity.name}の削除`, "confirm");

  const get = (id: string | undefined) =>
    id ? containers(draft).find((c) => c.container.id === id)!.container : undefined;
  const list = get(out.list);
  const detail = get(out.detail);
  const selected = `{{ state.selection.${entity.id}?.${pk} }}`;

  // ---- 一覧 ----
  if (list) {
    const table = findNode(list.root, "table")!;
    if (out.detail)
      addEvent(table, "rowClick", [
        { type: "navigate", to: out.detail, params: { [param]: `{{ event.row.${pk} }}` } },
      ]);
    if (out.form && !nest)
      addButton(list, {
        id: "newButton",
        label: "新規",
        variant: "primary",
        actions: [{ type: "openDialog", dialog: out.form }],
      });
    if (out.form)
      addButton(list, {
        id: "editButton",
        label: "編集",
        requires: `selection.${entity.id}`,
        actions: [{ type: "openDialog", dialog: out.form, params: { [param]: selected } }],
      });
    if (out.confirm && !nest)
      addButton(list, {
        id: "deleteButton",
        label: "削除",
        variant: "danger",
        requires: `selection.${entity.id}`,
        actions: [{ type: "openDialog", dialog: out.confirm, params: { [param]: selected } }],
      });
  }

  // ---- 詳細 ----
  if (detail) {
    const own = `{{ params.${param} }}`;
    if (out.form)
      addButton(detail, {
        id: "editButton",
        label: "編集",
        actions: [{ type: "openDialog", dialog: out.form, params: { [param]: own } }],
      });
    if (out.confirm)
      addButton(detail, {
        id: "deleteButton",
        label: "削除",
        variant: "danger",
        actions: [{ type: "openDialog", dialog: out.confirm, params: { [param]: own } }],
      });
    if (out.list)
      addButton(detail, {
        id: "backButton",
        label: "一覧へ戻る",
        variant: "secondary",
        actions: [{ type: "navigate", to: out.list }],
      });
    // 子の画面が既にあれば結ぶ
    for (const f of entity.fields) {
      if (f.type !== "children" || !f.entity || (f.cardinality ?? "many") !== "many") continue;
      wireChild(draft, detail, entity, f.id, f.entity);
    }
  }

  // ---- 削除の確認 → 一覧（入れ子は前の画面へ） ----
  if (out.confirm) {
    const ok = findNode(get(out.confirm)!.root, "ok")!;
    const after: Action = out.list && !nest ? { type: "navigate", to: out.list } : { type: "back" };
    addEvent(ok, "click", [after]);
  }

  // ---- 入れ子の親の詳細が既にあれば、そこから結ぶ ----
  if (nest) {
    const parentDetail = findGenerated(draft, "detail", nest.parent)?.container;
    const parent = draft.entities.find((e) => e.id === nest.parent);
    if (parentDetail && parent) wireChild(draft, parentDetail, parent, nest.field, entity.id);
  }

  if (!hadScreens && draft.entry === undefined) {
    const first = out.list ?? out.detail;
    if (first) setEntry(draft, first);
  }
  return out;
}

/**
 * 親の詳細の子の一覧（`<field>Table`）を、子の詳細（行クリック）と子のフォーム（「〈子〉を追加」、親を渡す）に結ぶ。
 * 既に結んであれば何もしない。
 */
function wireChild(
  draft: Project,
  parentDetail: Container,
  parent: Entity,
  field: string,
  childId: string,
): void {
  const child = draft.entities.find((e) => e.id === childId);
  const table = findNode(parentDetail.root, `${field.replace(/^_+/, "") || "field"}Table`);
  if (!child || !table) return;
  const childDetail = findGenerated(draft, "detail", child.id)?.container;
  const childForm = findGenerated(draft, "form", child.id)?.container;
  const childParam = recordParamName(child.id);
  if (childDetail && !table.events?.rowClick?.length) {
    addEvent(table, "rowClick", [
      {
        type: "navigate",
        to: childDetail.id,
        params: { [childParam]: `{{ event.row.${child.primaryKey} }}` },
      },
    ]);
  }
  const addId = `add${child.id}Button`;
  if (childForm && !findNode(parentDetail.root, addId)) {
    addButton(parentDetail, {
      id: addId,
      label: `${child.name}を追加`,
      actions: [
        {
          type: "openDialog",
          dialog: childForm.id,
          params: { [recordParamName(parent.id)]: `{{ params.${recordParamName(parent.id)} }}` },
        },
      ],
    });
  }
}
