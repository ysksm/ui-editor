import { nestParents } from "../er.js";
import type {
  Action,
  Container,
  Entity,
  Field,
  JsonValue,
  Kind,
  Node,
  Project,
} from "../schema.js";
import { containers, walkNodes, type ContainerKind } from "../walk.js";
import { tableColumns } from "./flow.js";
import { lowerFirst, uniqueId } from "./ids.js";

/**
 * 役割（kind）ごとのテンプレート（architecture.md 4.4・D3）。
 * - 一覧（list）: タイトル・操作ボタンの並び・表（選択できる）
 * - 詳細（detail）: レコードの項目と、入れ子の子の一覧
 * - フォーム（form）: 項目ごとの入力欄（下書き）と保存・キャンセル
 * - 確認（confirm）: 削除の確認と OK・キャンセル
 * 式は null を考慮する（生成コードは strictNullChecks を有効にするため。4.12）。ノード id は決定的。
 */

export const KIND_LABELS: Record<Kind, string> = {
  list: "一覧",
  detail: "詳細",
  form: "フォーム",
  confirm: "確認",
};

/** 画面・ダイアログのレコードを指すパラメータの名前（Device → deviceId）。 */
export function recordParamName(entityId: string): string {
  return `${lowerFirst(entityId)}Id`;
}

const label = (f: Field) => f.name ?? f.id;
const display = (e: Entity) => e.displayField ?? e.primaryKey;
/** 主キーと children 以外のフィールド。 */
const valueFields = (e: Entity) =>
  e.fields.filter((f) => f.type !== "children" && f.id !== e.primaryKey);
/** フィールド id からノード id を作る（ノード id は英字で始まる）。 */
const nodeId = (fieldId: string, suffix: string) =>
  `${fieldId.replace(/^_+/, "") || "field"}${suffix}`;

interface Ctx {
  project: Project;
  container: Container;
  kind: ContainerKind;
  entity: Entity;
  /** 操作ボタンの並びに残す仮の部品。 */
  carried: Node[];
}

/** ref のフィールドを、参照先の表示名で見せる式（見つからなければ主キー）。 */
function refText(project: Project, f: Field, value: string): string {
  const target = project.entities.find((e) => e.id === f.entity);
  if (!target) return `{{ ${value} }}`;
  return `{{ data.${target.id}.find((x) => x.${target.primaryKey} === ${value})?.${display(target)} ?? ${value} ?? "" }}`;
}

function valueText(project: Project, f: Field, value: string): string {
  if (f.type === "ref") return refText(project, f, value);
  if (f.type === "boolean") return `{{ ${value} ? "はい" : "いいえ" }}`;
  return `{{ ${value} ?? "" }}`;
}

function toolbar(carried: Node[]): Node[] {
  return carried.length
    ? [{ id: "toolbar", type: "Box", props: { direction: "row", gap: 8 }, children: carried }]
    : [];
}

function listTemplate({ container, entity, carried }: Ctx): Node {
  return {
    id: "page",
    type: "Box",
    props: { direction: "column", gap: 12 },
    children: [
      { id: "title", type: "Text", props: { text: container.name, variant: "title" } },
      ...toolbar(carried),
      {
        id: "table",
        type: "Table",
        props: {
          rows: `{{ data.${entity.id} }}`,
          entity: entity.id,
          selectable: true,
          columns: tableColumns(entity),
        },
      },
    ],
  };
}

function detailTemplate({ project, entity, carried }: Ctx): Node {
  const byId = new Map(project.entities.map((e) => [e.id, e]));
  const rows: Node[] = valueFields(entity)
    .filter((f) => f.id !== entity.displayField)
    .map((f) => ({
      id: nodeId(f.id, "Text"),
      type: "Text",
      props: { text: `${label(f)}: ${valueText(project, f, `record?.${f.id}`)}` },
    }));
  const children: Node[] = entity.fields
    .filter((f) => f.type === "children" && f.entity && byId.has(f.entity))
    .flatMap((f): Node[] => {
      const child = byId.get(f.entity!)!;
      const heading: Node = {
        id: nodeId(f.id, "Title"),
        type: "Text",
        props: { text: label(f), variant: "caption" },
      };
      if ((f.cardinality ?? "many") === "one") {
        return [
          heading,
          {
            id: nodeId(f.id, "Box"),
            type: "Box",
            props: { direction: "column", gap: 2 },
            children: valueFields(child).map((cf) => ({
              id: nodeId(`${f.id}_${cf.id}`, "Text"),
              type: "Text",
              props: {
                text: `${label(cf)}: ${valueText(project, cf, `record?.${f.id}?.${cf.id}`)}`,
              },
            })),
          },
        ];
      }
      return [
        heading,
        {
          id: nodeId(f.id, "Table"),
          type: "Table",
          props: {
            rows: `{{ record?.${f.id} ?? [] }}`,
            entity: child.id,
            columns: tableColumns(child),
          },
        },
      ];
    });
  return {
    id: "page",
    type: "Box",
    props: { direction: "column", gap: 12 },
    children: [
      {
        id: "title",
        type: "Text",
        props: { text: `{{ record?.${display(entity)} ?? "" }}`, variant: "title" },
      },
      { id: "fields", type: "Box", props: { direction: "column", gap: 4 }, children: rows },
      ...children,
      ...toolbar(carried),
    ],
  };
}

function setDraft(field: string): Action[] {
  return [{ type: "setDraft", field, value: "{{ event.value }}" }];
}

function input(project: Project, f: Field): Node {
  const common = { label: label(f), error: `{{ errors.${f.id} }}` };
  const id = nodeId(f.id, "Input");
  switch (f.type) {
    case "number":
      return {
        id,
        type: "NumberInput",
        props: { ...common, value: `{{ draft.${f.id} }}` },
        events: { change: setDraft(f.id) },
      };
    case "boolean":
      return {
        id,
        type: "Checkbox",
        props: { label: label(f), checked: `{{ draft.${f.id} }}` },
        events: { change: setDraft(f.id) },
      };
    case "enum":
      return {
        id,
        type: "Select",
        props: {
          ...common,
          value: `{{ draft.${f.id} }}`,
          options: (f.values ?? []).map((v) => ({ value: v, label: v })),
        },
        events: { change: setDraft(f.id) },
      };
    case "ref": {
      const target = project.entities.find((e) => e.id === f.entity);
      const options: JsonValue = target
        ? `{{ data.${target.id}.map((x) => ({ value: x.${target.primaryKey}, label: x.${display(target)} })) }}`
        : [];
      return {
        id,
        type: "Select",
        props: { ...common, value: `{{ draft.${f.id} }}`, options },
        events: { change: setDraft(f.id) },
      };
    }
    default:
      return {
        id,
        type: "TextInput",
        props: { ...common, value: `{{ draft.${f.id} }}` },
        events: { change: setDraft(f.id) },
      };
  }
}

function closeOrBack(kind: ContainerKind, result: string): Action {
  return kind === "dialog" ? { type: "closeDialog", result } : { type: "back" };
}

function formTemplate({ project, container, kind, entity, carried }: Ctx): Node {
  return {
    id: "page",
    type: "Box",
    props: { direction: "column", gap: 12 },
    children: [
      { id: "title", type: "Text", props: { text: container.name, variant: "title" } },
      ...valueFields(entity).map((f) => input(project, f)),
      {
        id: "actions",
        type: "Box",
        props: { direction: "row", gap: 8 },
        children: [
          {
            id: "save",
            type: "Button",
            props: { label: "保存", variant: "primary" },
            events: { click: [{ type: "saveDraft" }, closeOrBack(kind, "ok")] },
          },
          {
            id: "cancel",
            type: "Button",
            props: { label: "キャンセル", variant: "secondary" },
            events: { click: [closeOrBack(kind, "cancel")] },
          },
          ...carried,
        ],
      },
    ],
  };
}

function confirmTemplate({ project, kind, entity, carried }: Ctx): Node {
  const byId = new Map(project.entities.map((e) => [e.id, e]));
  const nested = entity.fields
    .filter((f) => f.type === "children" && f.entity && byId.has(f.entity))
    .map((f) => byId.get(f.entity!)!.name);
  const param = recordParamName(entity.id);
  return {
    id: "page",
    type: "Box",
    props: { direction: "column", gap: 12 },
    children: [
      {
        id: "message",
        type: "Text",
        props: {
          text: `「{{ record?.${display(entity)} ?? "" }}」を削除しますか？${nested.length ? `${nested.join("・")}も削除されます。` : ""}`,
        },
      },
      {
        id: "actions",
        type: "Box",
        props: { direction: "row", gap: 8 },
        children: [
          {
            id: "ok",
            type: "Button",
            props: { label: "削除する", variant: "danger" },
            events: {
              click: [
                {
                  type: "deleteRecord",
                  entity: entity.id,
                  match: { [entity.primaryKey]: `{{ params.${param} }}` },
                },
                closeOrBack(kind, "ok"),
              ],
            },
          },
          {
            id: "cancel",
            type: "Button",
            props: { label: "キャンセル", variant: "secondary" },
            events: { click: [closeOrBack(kind, "cancel")] },
          },
          ...carried,
        ],
      },
    ],
  };
}

function buildRoot(kind: Kind, ctx: Ctx): Node {
  switch (kind) {
    case "list":
      return listTemplate(ctx);
    case "detail":
      return detailTemplate(ctx);
    case "form":
      return formTemplate(ctx);
    case "confirm":
      return confirmTemplate(ctx);
  }
}

/** 中身のうち、テンプレートで置き換わる（仮の部品でない）ノードの数。 */
export function templateConflicts(container: Container): number {
  let n = 0;
  if (container.root) walkNodes(container.root, [], (node) => void (node.placeholder || n++));
  return n;
}

/**
 * 画面・ダイアログに役割とエンティティを設定し、テンプレートで中身を作る（FR-GEN-04 にも使う）。
 * - ランタイムがレコードを引く ref パラメータ（`deviceId` など）を足す。詳細・確認は必須、フォームは任意（無ければ作成）
 * - 入れ子のエンティティのフォームには、親を指す ref パラメータも足す（作成のときの親）
 * - 仮の部品は操作ボタンの並びに移して残す。一覧では、仮の表のイベント（行クリックなど）をテンプレートの表に移す
 * - 仮の部品でない中身は置き換わる（エディタは templateConflicts で数を示して確かめる）
 */
export function applyTemplate(
  draft: Project,
  containerId: string,
  spec: { kind: Kind; entity: string },
): void {
  const ref = containers(draft).find((c) => c.container.id === containerId);
  if (!ref) throw new Error(`画面・ダイアログ "${containerId}" がありません`);
  const entity = draft.entities.find((e) => e.id === spec.entity);
  if (!entity) throw new Error(`エンティティ "${spec.entity}" がありません`);
  const c = ref.container;
  c.kind = spec.kind;
  c.entity = entity.id;

  if (spec.kind !== "list") {
    c.params ??= {};
    const name = recordParamName(entity.id);
    c.params[name] = {
      type: "ref",
      entity: entity.id,
      ...(spec.kind === "form" ? {} : { required: true }),
    };
    const parent = spec.kind === "form" ? nestParents(draft.entities).get(entity.id) : undefined;
    if (parent) c.params[recordParamName(parent.parent)] ??= { type: "ref", entity: parent.parent };
  }

  // 仮の部品を集める（仮の Box の中身もたどる）
  const carried: Node[] = [];
  let placeholderTableEvents: Node["events"];
  const collect = (node: Node) => {
    if (node.placeholder && node.type === "Box") {
      node.children?.forEach(collect);
    } else if (node.placeholder && node.type === "Table" && spec.kind === "list") {
      // 仮の表のイベントは、テンプレートの表へ（同じイベントはつなげる）
      for (const [event, actions] of Object.entries(node.events ?? {})) {
        placeholderTableEvents ??= {};
        placeholderTableEvents[event] = [...(placeholderTableEvents[event] ?? []), ...actions];
      }
    } else if (node.placeholder) {
      carried.push(node);
    }
  };
  if (c.root) {
    if (c.root.placeholder) collect(c.root);
    else
      walkNodes(
        c.root,
        [],
        (n) =>
          void (
            n.placeholder &&
            n.type !== "Box" &&
            (n.type !== "Table" || spec.kind !== "list") &&
            carried.push(n)
          ),
      );
  }
  const ctx: Ctx = { project: draft, container: c, kind: ref.kind, entity, carried: [] };
  const templateIds = new Set<string>();
  walkNodes(buildRoot(spec.kind, ctx), [], (n) => void templateIds.add(n.id));
  // 残す仮の部品の id がテンプレートの id とぶつかれば付け直す
  for (const n of carried) {
    if (templateIds.has(n.id)) n.id = uniqueId(n.id, templateIds);
    templateIds.add(n.id);
  }
  ctx.carried = carried;
  const root = buildRoot(spec.kind, ctx);
  if (spec.kind === "list" && placeholderTableEvents) {
    const table = root.children!.find((n) => n.id === "table")!;
    table.events = placeholderTableEvents;
  }
  c.root = root;
}
