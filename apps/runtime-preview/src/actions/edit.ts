import type {
  Action,
  ActionType,
  Events,
  JsonValue,
  Node,
  ParamDef,
  Project,
} from "@ui-editor/schema";

/** イベント・アクションの編集操作。どれも新しいプロジェクト（またはイベント）を返す。 */

export type OwnerKind = "screen" | "dialog" | "component";

/** イベントを持つ場所: 画面そのもの（`mount`）か、画面・ダイアログ・コンポーネントの中のノード。 */
export interface EventTarget {
  owner: { kind: OwnerKind; id: string };
  /** 無ければ画面そのもの。 */
  node?: string | undefined;
}

export function ownerOf(project: Project, kind: OwnerKind, id: string) {
  if (kind === "screen") return project.screens.find((s) => s.id === id);
  if (kind === "dialog") return project.dialogs?.find((d) => d.id === id);
  return project.components?.find((c) => c.id === id);
}

export function findNode(root: Node, id: string): Node | undefined {
  if (root.id === id) return root;
  for (const child of root.children ?? []) {
    const found = findNode(child, id);
    if (found) return found;
  }
  return undefined;
}

export function eventsOf(project: Project, target: EventTarget): Events {
  const owner = ownerOf(project, target.owner.kind, target.owner.id);
  const events =
    owner &&
    (target.node === undefined
      ? "events" in owner
        ? owner.events
        : undefined
      : findNode(owner.root, target.node)?.events);
  return events ?? Object.create(null);
}

function mapNode(root: Node, id: string, fn: (n: Node) => Node): Node {
  if (root.id === id) return fn(root);
  if (!root.children) return root;
  return { ...root, children: root.children.map((c) => mapNode(c, id, fn)) };
}

/** 空のイベントは消す（書き出したファイルに `events: {}` を残さない）。 */
function clean(events: Events): Events | undefined {
  const entries = Object.entries(events).filter(([, actions]) => actions.length > 0);
  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}

export function setEvents(project: Project, target: EventTarget, events: Events): Project {
  const next = clean(events);
  const { kind, id } = target.owner;
  const update = <T extends { id: string; root: Node; events?: Events | undefined }>(o: T): T => {
    if (o.id !== id) return o;
    if (target.node === undefined) return { ...o, events: next };
    return { ...o, root: mapNode(o.root, target.node, (n) => ({ ...n, events: next })) };
  };
  if (kind === "screen") return { ...project, screens: project.screens.map(update) };
  if (kind === "dialog") return { ...project, dialogs: project.dialogs?.map(update) };
  return { ...project, components: project.components?.map(update) };
}

/** ノードの種類ごとのイベント名の候補（v0 ではイベント名はスキーマで縛っていない）。 */
export function eventNamesFor(node: Node | undefined): string[] {
  if (!node) return ["mount"];
  switch (node.type) {
    case "TextInput":
    case "NumberInput":
    case "Checkbox":
      return ["change"];
    case "Table":
      return ["rowClick"];
    default:
      return ["click"];
  }
}

export const ACTION_TYPES: ActionType[] = [
  "navigate",
  "openDialog",
  "closeDialog",
  "setState",
  "updateData",
];

export const ACTION_LABELS: Record<ActionType, string> = {
  navigate: "画面遷移",
  openDialog: "ダイアログを開く",
  closeDialog: "ダイアログを閉じる",
  setState: "state を設定",
  updateData: "データを更新",
};

/** 種類を変えたときの初期値。 */
export function newAction(type: ActionType, project: Project): Action {
  switch (type) {
    case "navigate":
      return withParams({ type, to: project.screens[0]!.id }, project.screens[0]!.params);
    case "openDialog":
      return withParams(
        { type, dialog: project.dialogs?.[0]?.id ?? "" },
        project.dialogs?.[0]?.params,
      );
    case "closeDialog":
      return { type };
    case "setState":
      return {
        type,
        path: Object.keys(project.state ?? {})[0] ?? "value",
        value: "{{ event.value }}",
      };
    case "updateData":
      return {
        type,
        collection: Object.keys(project.sampleData)[0] ?? "",
        match: { id: "" },
        set: {},
      };
  }
}

/** 遷移先・ダイアログの必須の引数（`default` の無いもの）を空で用意する。 */
export function withParams<T extends Action & { params?: Record<string, JsonValue> | undefined }>(
  action: T,
  defs: Record<string, ParamDef> | undefined,
): T {
  const required = Object.entries(defs ?? {}).filter(([, d]) => d.default === undefined);
  if (required.length === 0) return { ...action, params: undefined };
  return {
    ...action,
    params: Object.fromEntries(required.map(([k]) => [k, action.params?.[k] ?? ""])),
  };
}

/**
 * フォームの入力値を JSON の値にする。`{{` を含むものと JSON として読めないものは文字列のまま。
 * （`true` / `12` / `null` / `[...]` は JSON として読む。文字列の "true" を入れたいときは `"true"` と書く）
 */
export function parseLiteral(text: string): JsonValue {
  if (text.includes("{{")) return text;
  try {
    return JSON.parse(text) as JsonValue;
  } catch {
    return text;
  }
}

export function formatLiteral(value: JsonValue | undefined): string {
  if (value === undefined) return "";
  if (typeof value === "string") {
    // JSON として読めてしまう文字列は引用符付きで表示する
    return value !== parseLiteral(value) ? JSON.stringify(value) : value;
  }
  return JSON.stringify(value);
}

export function move<T>(list: readonly T[], index: number, delta: -1 | 1): T[] {
  const to = index + delta;
  if (to < 0 || to >= list.length) return [...list];
  const next = [...list];
  const [item] = next.splice(index, 1);
  next.splice(to, 0, item!);
  return next;
}
