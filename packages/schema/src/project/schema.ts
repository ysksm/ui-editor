import { z } from "zod";

/**
 * プロジェクトスキーマ v0。
 * zod のスキーマは形だけを表す（transform / refine は使わない）。
 * id の参照チェックなどは validate.ts で別に行う。
 */

export const SCHEMA_VERSION = "0" as const;

/** 任意の JSON 値。文字列は `{{ 式 }}` のバインディングを含んでよい。 */
export const JsonValueSchema = z.json().meta({ id: "JsonValue" });
export type JsonValue = z.infer<typeof JsonValueSchema>;

const Identifier = z
  .string()
  .regex(/^[A-Za-z_][A-Za-z0-9_]*$/, "識別子（英字・数字・_）で指定してください");

/** 画面・ダイアログ・ノードの id。 */
const Id = z.string().regex(/^[A-Za-z][A-Za-z0-9_-]*$/, "英字で始まる id を指定してください");

/** コンポーネント名（= ノードの type として使う名前）。 */
const ComponentName = z.string().regex(/^[A-Z][A-Za-z0-9]*$/, "PascalCase で指定してください");

/** `{{ 式 }}` を含む文字列、または固定値の文字列。 */
const Template = z.string().meta({ description: "`{{ 式 }}` 形式のバインディングを含む文字列" });

// ---- style ----

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

// ---- actions ----

const Params = z.record(z.string(), JsonValueSchema);

export const NavigateActionSchema = z.strictObject({
  type: z.literal("navigate"),
  /** 遷移先の画面 id。遷移図を静的に作れるよう、バインディングは不可。 */
  to: Id,
  params: Params.optional(),
});

export const OpenDialogActionSchema = z.strictObject({
  type: z.literal("openDialog"),
  /** ダイアログ id。バインディングは不可。 */
  dialog: Id,
  params: Params.optional(),
});

export const CloseDialogActionSchema = z.strictObject({
  type: z.literal("closeDialog"),
});

export const SetStateActionSchema = z.strictObject({
  type: z.literal("setState"),
  /** `state` 配下のドットパス。例: `draft.network.ip` */
  path: z.string().regex(/^[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z_][A-Za-z0-9_]*)*$/),
  value: JsonValueSchema,
});

export const UpdateDataActionSchema = z.strictObject({
  type: z.literal("updateData"),
  /** `sampleData` のコレクション名。 */
  collection: Identifier,
  /** 更新対象の条件（フィールド = 値 の AND）。 */
  match: Params,
  /** 上書きするフィールド。 */
  set: Params,
});

export const ActionSchema = z
  .discriminatedUnion("type", [
    NavigateActionSchema,
    OpenDialogActionSchema,
    CloseDialogActionSchema,
    SetStateActionSchema,
    UpdateDataActionSchema,
  ])
  .meta({ id: "Action" });
export type Action = z.infer<typeof ActionSchema>;
export type ActionType = Action["type"];

/** イベント名 → 順に実行するアクション。 */
export const EventsSchema = z.record(Identifier, z.array(ActionSchema)).meta({ id: "Events" });
export type Events = z.infer<typeof EventsSchema>;

// ---- node ----

export const RepeatSchema = z
  .strictObject({
    /** 配列を返すバインディング。例: `{{ data.devices }}` */
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
  /** 組み込みの type（`BUILTIN_NODE_TYPES`）またはコンポーネント名。 */
  type: string;
  props?: Record<string, JsonValue> | undefined;
  style?: Style | undefined;
  repeat?: Repeat | undefined;
  /** false になると描画しない。 */
  visible?: boolean | string | undefined;
  events?: Events | undefined;
  children?: Node[] | undefined;
}

export const NodeSchema: z.ZodType<Node> = z
  .strictObject({
    id: Id,
    type: z.string().regex(/^[A-Z][A-Za-z0-9]*$/, "PascalCase で指定してください"),
    props: z.record(z.string(), JsonValueSchema).optional(),
    style: StyleSchema.optional(),
    repeat: RepeatSchema.optional(),
    visible: z.union([z.boolean(), Template]).optional(),
    events: EventsSchema.optional(),
    get children() {
      return z.array(NodeSchema).optional();
    },
  })
  .meta({ id: "Node" });

/** 組み込みのノード。props / イベントは README を参照。 */
export const BUILTIN_NODE_TYPES = [
  "Box",
  "Text",
  "Button",
  "TextInput",
  "NumberInput",
  "Checkbox",
  "Table",
] as const;
export type BuiltinNodeType = (typeof BUILTIN_NODE_TYPES)[number];

// ---- screen / component / dialog ----

/** 引数（画面パラメータ・ダイアログパラメータ・コンポーネント props）の定義。 */
export const ParamDefSchema = z
  .strictObject({
    /** TS の型式。例: `string`, `Alarm`, `"online" | "offline"` */
    type: z.string().min(1),
    /** 省略時の値。無い場合は必須。 */
    default: JsonValueSchema.optional(),
  })
  .meta({ id: "ParamDef" });
export type ParamDef = z.infer<typeof ParamDefSchema>;

const ParamDefs = z.record(Identifier, ParamDefSchema);

export const ScreenSchema = z
  .strictObject({
    id: Id,
    name: z.string().min(1),
    /** ルートのパス。例: `/devices/:deviceId` */
    path: z.string().startsWith("/"),
    params: ParamDefs.optional(),
    /** 画面のイベント（`mount`）。 */
    events: EventsSchema.optional(),
    root: NodeSchema,
  })
  .meta({ id: "Screen" });
export type Screen = z.infer<typeof ScreenSchema>;

export const ComponentSchema = z
  .strictObject({
    /** ノードの type として使う名前。 */
    id: ComponentName,
    name: z.string().min(1).optional(),
    props: ParamDefs.optional(),
    root: NodeSchema,
  })
  .meta({ id: "Component" });
export type Component = z.infer<typeof ComponentSchema>;

export const DialogSchema = z
  .strictObject({
    id: Id,
    name: z.string().min(1),
    params: ParamDefs.optional(),
    root: NodeSchema,
  })
  .meta({ id: "Dialog" });
export type Dialog = z.infer<typeof DialogSchema>;

// ---- data ----

export const DataModelSchema = z
  .strictObject({
    /** データモデルを定義する TS のソース（型定義のみ）。 */
    source: z.string(),
  })
  .meta({ id: "DataModel" });
export type DataModel = z.infer<typeof DataModelSchema>;

export const StateDefSchema = z
  .strictObject({
    /** TS の型式。`dataModel.source` の型名を参照してよい。 */
    type: z.string().min(1),
    initial: JsonValueSchema,
  })
  .meta({ id: "StateDef" });
export type StateDef = z.infer<typeof StateDefSchema>;

// ---- project ----

export const ProjectSchema = z
  .strictObject({
    /** エディタ補完用の JSON Schema の参照。 */
    $schema: z.string().optional(),
    schemaVersion: z.literal(SCHEMA_VERSION),
    name: z.string().min(1),
    description: z.string().optional(),
    /** 最初に表示する画面 id。省略時は `screens[0]`。 */
    entry: Id.optional(),
    dataModel: DataModelSchema,
    /** アプリ全体の状態（`{{ state.xxx }}`）。 */
    state: z.record(Identifier, StateDefSchema).optional(),
    screens: z.array(ScreenSchema).min(1),
    components: z.array(ComponentSchema).optional(),
    dialogs: z.array(DialogSchema).optional(),
    /** コレクション名 → レコードの配列（`{{ data.xxx }}`）。 */
    sampleData: z.record(Identifier, z.array(JsonValueSchema)),
  })
  .meta({ id: "Project", title: "ui-editor project file v0" });
export type Project = z.infer<typeof ProjectSchema>;
