import { extractExpressions, type Node, type Project } from "@ui-editor/schema";

/** プロジェクト内のバインディング 1 つと、そこで使える名前。 */
export interface BindingSite {
  /** 例: `screen:dashboard / deviceCard / props.text` */
  location: string;
  /** `{{ }}` の中の式。 */
  expression: string;
  /** その場所のスコープにある名前。 */
  names: string[];
  /** 式が書かれている画面・ダイアログ・コンポーネント。 */
  owner: { kind: "screen" | "dialog" | "component"; id: string };
  /** 式が書かれているノードの id（画面のイベントなら無し）。 */
  node?: string | undefined;
}

/** プロジェクト内のすべてのバインディングを、使える名前と一緒に集める（静的検査・一覧表示用）。 */
export function collectBindings(project: Project): BindingSite[] {
  const sites: BindingSite[] = [];
  const base = ["data", "state"];

  let owner: BindingSite["owner"] = { kind: "screen", id: "" };
  let nodeId: string | undefined;
  const add = (location: string, value: unknown, names: string[]) => {
    const walk = (v: unknown, path: string) => {
      if (typeof v === "string") {
        for (const expression of extractExpressions(v))
          sites.push({ location: path, expression, names, owner, node: nodeId });
      } else if (Array.isArray(v)) v.forEach((x, i) => walk(x, `${path}[${i}]`));
      else if (v !== null && typeof v === "object")
        for (const [k, x] of Object.entries(v)) walk(x, path ? `${path}.${k}` : k);
    };
    walk(value, location);
  };

  const visitNode = (node: Node, outer: string[]) => {
    nodeId = node.id;
    const at = (field: string) => `${owner.kind}:${owner.id} / ${node.id} / ${field}`;
    if (node.repeat) add(at("repeat.each"), node.repeat.each, outer);
    const names = node.repeat ? [...outer, node.repeat.as, "index"] : outer;
    if (node.repeat?.key) add(at("repeat.key"), node.repeat.key, names);
    if (node.visible !== undefined) add(at("visible"), node.visible, names);
    for (const [key, value] of Object.entries(node.props ?? {})) {
      // Table の列の値は行ごとに評価する（`row` が使える）
      if (node.type === "Table" && key === "columns" && Array.isArray(value)) {
        value.forEach((col, i) => add(at(`props.columns[${i}]`), col, [...names, "row"]));
      } else add(at(`props.${key}`), value, names);
    }
    if (node.style) add(at("style"), node.style, names);
    for (const [event, actions] of Object.entries(node.events ?? {}))
      add(at(`events.${event}`), actions, [...names, "event"]);
    for (const child of node.children ?? []) visitNode(child, names);
  };

  for (const screen of project.screens) {
    owner = { kind: "screen", id: screen.id };
    nodeId = undefined;
    const names = [...base, "params"];
    for (const [event, actions] of Object.entries(screen.events ?? {}))
      add(`screen:${screen.id} / events.${event}`, actions, [...names, "event"]);
    visitNode(screen.root, names);
  }
  for (const dialog of project.dialogs ?? []) {
    owner = { kind: "dialog", id: dialog.id };
    visitNode(dialog.root, [...base, "params"]);
  }
  for (const component of project.components ?? []) {
    owner = { kind: "component", id: component.id };
    visitNode(component.root, [...base, "props"]);
  }
  return sites;
}
