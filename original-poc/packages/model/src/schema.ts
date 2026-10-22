import { z } from "zod";

/**
 * スキーマ poc-0（original-poc/docs/architecture.md の 3 章）。
 * zod のスキーマは形だけを表す（transform / refine は使わない）。
 * 参照・整合性（id の存在、入れ子のデータの形など）は validate.ts で別に検証する。
 */

export const SCHEMA_VERSION = "poc-0" as const;

/** 任意の JSON 値。文字列は `{{ 式 }}` のバインディングを含んでよい。 */
export const JsonValueSchema = z.json();
export type JsonValue = z.infer<typeof JsonValueSchema>;

/** 画面・ダイアログ・ノードの id。 */
export const ID_PATTERN = /^[A-Za-z][A-Za-z0-9_-]*$/;
/** フィールド・state のキー・パラメータの名前。 */
export const IDENTIFIER_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;
/** エンティティ id（PascalCase）。 */
export const ENTITY_ID_PATTERN = /^[A-Z][A-Za-z0-9]*$/;
/** ノードの type（PascalCase）。 */
const NODE_TYPE_PATTERN = /^[A-Z][A-Za-z0-9]*$/;

const Id = z.string().regex(ID_PATTERN, "英字で始まる id（英数字・_・-）を指定してください");
const Identifier = z
  .string()
  .regex(IDENTIFIER_PATTERN, "識別子（英字・数字・_、先頭は数字以外）を指定してください");
const EntityId = z
  .string()
  .regex(
    ENTITY_ID_PATTERN,
    "エンティティ id は PascalCase（英大文字で始まる英数字）で指定してください",
  );

/** `{{ 式 }}` を含む文字列、または固定値の文字列。 */
const Template = z.string();

export const ScalarSchema = z.union([z.string(), z.number(), z.boolean(), z.null()]);
export type Scalar = z.infer<typeof ScalarSchema>;

// ---- ER（エンティティとフィールド） ----

export const FIELD_TYPES = [
  "id",
  "string",
  "number",
  "boolean",
  "date",
  "enum",
  "ref",
  "children",
] as const;
export type FieldType = (typeof FIELD_TYPES)[number];

export const FIELD_FORMATS = [
  "email",
  "url",
  "ipv4",
  "phone",
  "multiline",
  "date",
  "datetime",
] as const;
export type FieldFormat = (typeof FIELD_FORMATS)[number];

export const ON_DELETE = ["restrict", "setNull", "cascade"] as const;
export type OnDelete = (typeof ON_DELETE)[number];

export const CARDINALITIES = ["many", "one"] as const;
export type Cardinality = (typeof CARDINALITIES)[number];

export const FieldSchema = z
  .strictObject({
    id: Identifier,
    /** 表示名。 */
    name: z.string().min(1).optional(),
    type: z.enum(FIELD_TYPES),
    required: z.boolean().optional(),
    default: ScalarSchema.optional(),
    /** enum の値。 */
    values: z.array(z.string().min(1)).optional(),
    /** ref の参照先 / children の子のエンティティ。 */
    entity: EntityId.optional(),
    /** ref: 参照先が消えたときの扱い（既定 restrict）。 */
    onDelete: z.enum(ON_DELETE).optional(),
    /** children: 子の配列（many、既定）か 1 件（one）か。 */
    cardinality: z.enum(CARDINALITIES).optional(),
    /** 文字列・日付の書式（生成と検証）。 */
    format: z.enum(FIELD_FORMATS).optional(),
    /** number の範囲（生成と検証）。 */
    min: z.number().optional(),
    max: z.number().optional(),
  })
  .meta({ id: "Field" });
export type Field = z.infer<typeof FieldSchema>;

export const EntitySchema = z
  .strictObject({
    id: EntityId,
    /** 表示名（例: 機器）。 */
    name: z.string().min(1),
    /** 主キーのフィールド（type: "id"）。 */
    primaryKey: Identifier,
    /** 参照の選択肢・表示に使うフィールド。 */
    displayField: Identifier.optional(),
    fields: z.array(FieldSchema),
  })
  .meta({ id: "Entity" });
export type Entity = z.infer<typeof EntitySchema>;

// ---- データ（入れ子） ----

/**
 * レコード。children のフィールドには子のレコード（many は配列、one は 1 件か null）が入る。
 * 形はエンティティ定義に依存するので、ここでは「キー → JSON 値」とだけ書き、中身は validate.ts で調べる。
 */
export const DataRecordSchema = z.record(z.string(), JsonValueSchema).meta({ id: "DataRecord" });
export type DataRecord = { [field: string]: JsonValue };

/** ルートのエンティティ id → レコードの配列。入れ子のエンティティは親のレコードの中に持つ。 */
export const DataSchema = z.record(EntityId, z.array(DataRecordSchema)).meta({ id: "Data" });
export type Data = Record<string, DataRecord[]>;

// ---- style（v0 と同じ） ----

const Length = z.union([z.number(), z.string()]);

export const StyleSchema = z
  .strictObject({
    width: Length.optional(),
    height: Length.optional(),
    minWidth: Length.optional(),
    maxWidth: Length.optional(),
    minHeight: Length.optional(),
    maxHeight: Length.optional(),
    padding: Length.optional(),
    margin: Length.optional(),
    display: z.enum(["flex", "inline-flex", "block", "inline-block", "grid", "none"]).optional(),
    flexDirection: z.enum(["row", "row-reverse", "column", "column-reverse"]).optional(),
    flexWrap: z.enum(["nowrap", "wrap", "wrap-reverse"]).optional(),
    justifyContent: z
      .enum(["flex-start", "flex-end", "center", "space-between", "space-around", "space-evenly"])
      .optional(),
    alignItems: z.enum(["flex-start", "flex-end", "center", "stretch", "baseline"]).optional(),
    gap: Length.optional(),
    flex: Length.optional(),
    flexGrow: z.number().optional(),
    flexShrink: z.number().optional(),
    overflow: z.enum(["visible", "hidden", "auto", "scroll"]).optional(),
    color: Template.optional(),
    backgroundColor: Template.optional(),
    border: z.string().optional(),
    borderRadius: Length.optional(),
    fontSize: Length.optional(),
    fontWeight: z.union([z.number(), z.enum(["normal", "bold"])]).optional(),
    textAlign: z.enum(["left", "center", "right"]).optional(),
    cursor: z.enum(["default", "pointer"]).optional(),
  })
  .meta({ id: "Style", description: "主要な CSS プロパティ。数値は px として扱う" });
export type Style = z.infer<typeof StyleSchema>;

// ---- アクション ----

/** 名前 → 値（`{{ }}` 可）。遷移先に渡す値、作成・更新する項目、検索の条件など。 */
export type Params = Record<string, JsonValue>;
const Params = z.record(Identifier, JsonValueSchema);

interface Guard {
  /** 偽なら飛ばす（`{{ }}` の式）。 */
  when?: string | undefined;
}

export interface NavigateAction extends Guard {
  type: "navigate";
  /** 遷移先の画面 id。フロー図を静的に作れるよう、バインディングは不可。 */
  to: string;
  params?: Params | undefined;
}
export interface OpenDialogAction extends Guard {
  type: "openDialog";
  /** ダイアログ id。バインディングは不可。 */
  dialog: string;
  params?: Params | undefined;
  /** 閉じた結果（closeDialog の result）→ 呼び出し元で実行するアクション。 */
  onClose?: Record<string, Action[]> | undefined;
}
export interface CloseDialogAction extends Guard {
  type: "closeDialog";
  /** 呼び出し元に返す結果。既定は "ok"。 */
  result?: string | undefined;
}
export interface BackAction extends Guard {
  type: "back";
}
export interface SetStateAction extends Guard {
  type: "setState";
  /** `state` 配下のドットパス。例: `filter.status` */
  path: string;
  value: JsonValue;
}
export interface SelectAction extends Guard {
  type: "select";
  entity: string;
  /** 選ぶレコードの主キー（`{{ }}` 可）。null で解除。 */
  id: string | null;
}
export interface CreateRecordAction extends Guard {
  type: "createRecord";
  entity: string;
  values: Params;
  /** 入れ子のエンティティのとき、親のレコードの主キー（`{{ }}` 可）。 */
  parent?: string | undefined;
}
export interface UpdateRecordAction extends Guard {
  type: "updateRecord";
  entity: string;
  /** 対象の条件（フィールド = 値 の AND）。 */
  match: Params;
  /** 上書きするフィールド。 */
  set: Params;
}
export interface DeleteRecordAction extends Guard {
  type: "deleteRecord";
  entity: string;
  match: Params;
}
export interface SetDraftAction extends Guard {
  type: "setDraft";
  field: string;
  value: JsonValue;
}
export interface SaveDraftAction extends Guard {
  type: "saveDraft";
}

export type Action =
  | NavigateAction
  | OpenDialogAction
  | CloseDialogAction
  | BackAction
  | SetStateAction
  | SelectAction
  | CreateRecordAction
  | UpdateRecordAction
  | DeleteRecordAction
  | SetDraftAction
  | SaveDraftAction;
export type ActionType = Action["type"];

const when = Template.optional();
const StatePath = z
  .string()
  .regex(
    /^[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z_][A-Za-z0-9_]*)*$/,
    "ドット区切りのパス（例: filter.status）を指定してください",
  );

export const ActionSchema: z.ZodType<Action> = z
  .discriminatedUnion("type", [
    z.strictObject({ type: z.literal("navigate"), to: Id, params: Params.optional(), when }),
    z.strictObject({
      type: z.literal("openDialog"),
      dialog: Id,
      params: Params.optional(),
      get onClose() {
        return z.record(Identifier, z.array(ActionSchema)).optional();
      },
      when,
    }),
    z.strictObject({ type: z.literal("closeDialog"), result: Identifier.optional(), when }),
    z.strictObject({ type: z.literal("back"), when }),
    z.strictObject({ type: z.literal("setState"), path: StatePath, value: JsonValueSchema, when }),
    z.strictObject({
      type: z.literal("select"),
      entity: EntityId,
      id: z.union([Template, z.null()]),
      when,
    }),
    z.strictObject({
      type: z.literal("createRecord"),
      entity: EntityId,
      values: Params,
      parent: Template.optional(),
      when,
    }),
    z.strictObject({
      type: z.literal("updateRecord"),
      entity: EntityId,
      match: Params,
      set: Params,
      when,
    }),
    z.strictObject({ type: z.literal("deleteRecord"), entity: EntityId, match: Params, when }),
    z.strictObject({
      type: z.literal("setDraft"),
      field: Identifier,
      value: JsonValueSchema,
      when,
    }),
    z.strictObject({ type: z.literal("saveDraft"), when }),
  ])
  .meta({ id: "Action" });

export const ACTION_TYPES = [
  "navigate",
  "openDialog",
  "closeDialog",
  "back",
  "setState",
  "select",
  "createRecord",
  "updateRecord",
  "deleteRecord",
  "setDraft",
  "saveDraft",
] as const satisfies readonly ActionType[];

/** イベント名 → 順に実行するアクション。 */
export type Events = Record<string, Action[]>;
export const EventsSchema = z.record(Identifier, z.array(ActionSchema)).meta({ id: "Events" });

// ---- ノード ----

export const RepeatSchema = z
  .strictObject({
    /** 配列を返すバインディング。例: `{{ data.Device }}` */
    each: Template,
    /** 要素を参照する変数名。例: `device` → `{{ device.name }}` */
    as: Identifier,
    /** 要素の一意キーを返すバインディング（React の key）。 */
    key: Template.optional(),
  })
  .meta({ id: "Repeat" });
export type Repeat = z.infer<typeof RepeatSchema>;

export interface Node {
  id: string;
  /** 組み込みの type（`BUILTIN_NODE_TYPES`）。 */
  type: string;
  props?: Record<string, JsonValue> | undefined;
  style?: Style | undefined;
  repeat?: Repeat | undefined;
  /** false になると描画しない。 */
  visible?: boolean | string | undefined;
  events?: Events | undefined;
  children?: Node[] | undefined;
  /** 遷移を引いたときに自動で置いた仮の部品（D1 の案 b）。 */
  placeholder?: true | undefined;
}

export const NodeSchema: z.ZodType<Node> = z
  .strictObject({
    id: Id,
    type: z.string().regex(NODE_TYPE_PATTERN, "PascalCase で指定してください"),
    props: z.record(z.string(), JsonValueSchema).optional(),
    style: StyleSchema.optional(),
    repeat: RepeatSchema.optional(),
    visible: z.union([z.boolean(), Template]).optional(),
    events: EventsSchema.optional(),
    get children() {
      return z.array(NodeSchema).optional();
    },
    placeholder: z.literal(true).optional(),
  })
  .meta({ id: "Node" });

/** 組み込みのノード。props / イベントは architecture.md の 3 章を参照。 */
export const BUILTIN_NODE_TYPES = [
  "Box",
  "Text",
  "Button",
  "TextInput",
  "NumberInput",
  "Checkbox",
  "Select",
  "Table",
] as const;
export type BuiltinNodeType = (typeof BUILTIN_NODE_TYPES)[number];

// ---- 画面・ダイアログ ----

export const KINDS = ["list", "detail", "form", "confirm"] as const;
export type Kind = (typeof KINDS)[number];

export const PARAM_TYPES = ["string", "number", "boolean", "ref"] as const;
export type ParamType = (typeof PARAM_TYPES)[number];

export const ParamDefSchema = z
  .strictObject({
    type: z.enum(PARAM_TYPES),
    /** type: "ref" のとき。画面のレコード（record）や入れ子の親を決める。 */
    entity: EntityId.optional(),
    required: z.boolean().optional(),
  })
  .meta({ id: "ParamDef" });
export type ParamDef = z.infer<typeof ParamDefSchema>;

const ParamDefs = z.record(Identifier, ParamDefSchema);

export const ScreenSchema = z
  .strictObject({
    id: Id,
    name: z.string().min(1),
    /** 役割（D3）。 */
    kind: z.enum(KINDS).optional(),
    /** 扱うエンティティ。 */
    entity: EntityId.optional(),
    /** ルートのパス。例: `/devices/:deviceId`（省略時は id から作る）。 */
    path: z.string().startsWith("/", "/ で始まるパスを指定してください").optional(),
    params: ParamDefs.optional(),
    /** 画面を開いたときのアクション。 */
    events: z.strictObject({ mount: z.array(ActionSchema).optional() }).optional(),
    /** 画面の中身。省略可（中身の無い画面）。 */
    root: NodeSchema.optional(),
  })
  .meta({ id: "Screen" });
export type Screen = z.infer<typeof ScreenSchema>;

export const DialogSchema = z
  .strictObject({
    id: Id,
    name: z.string().min(1),
    kind: z.enum(KINDS).optional(),
    entity: EntityId.optional(),
    params: ParamDefs.optional(),
    root: NodeSchema.optional(),
  })
  .meta({ id: "Dialog" });
export type Dialog = z.infer<typeof DialogSchema>;

/** 画面とダイアログをまとめて扱うときの型。 */
export type Container = Screen | Dialog;

// ---- 配置情報 ----

export const PositionSchema = z.strictObject({ x: z.number(), y: z.number() });
export type Position = z.infer<typeof PositionSchema>;

export const LayoutSchema = z
  .strictObject({
    /** フロー図のノード位置（画面・ダイアログ id → 左上の座標）。 */
    flow: z.record(Id, PositionSchema).optional(),
    /** ER 図のノード位置（エンティティ id → 左上の座標）。 */
    er: z.record(EntityId, PositionSchema).optional(),
  })
  .meta({ id: "Layout", description: "見た目だけの情報。ファイルの末尾に書き出す" });
export type Layout = z.infer<typeof LayoutSchema>;

// ---- プロジェクト ----

export const ProjectSchema = z
  .strictObject({
    /** エディタ補完用の JSON Schema の参照。 */
    $schema: z.string().optional(),
    schemaVersion: z.literal(SCHEMA_VERSION),
    name: z.string().min(1),
    description: z.string().optional(),
    /** 最初に表示する画面 id。省略時は `screens[0]`。 */
    entry: Id.optional(),
    entities: z.array(EntitySchema),
    data: DataSchema,
    /** 利用者が定義する状態の初期値（`{{ state.xxx }}`）。`selection` は予約語。 */
    state: z.record(Identifier, JsonValueSchema),
    screens: z.array(ScreenSchema),
    dialogs: z.array(DialogSchema),
    layout: LayoutSchema.optional(),
  })
  .meta({ id: "Project", title: "original-poc project file poc-0" });
export type Project = z.infer<typeof ProjectSchema>;
