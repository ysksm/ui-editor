import { findTransition, type Transition } from "../flow.js";
import type { Action, Node, Project } from "../schema.js";
import { containers, walkNodes } from "../walk.js";
import { mapActionLists, pruneAll } from "./containers.js";
import { numberedId, uniqueId } from "./ids.js";

/**
 * 遷移の編集操作（D1 の案 b: 線を引くと遷移元に仮の部品を置く）。
 */

function nodeIds(root: Node | undefined): string[] {
  const ids: string[] = [];
  if (root) walkNodes(root, [], (n) => ids.push(n.id));
  return ids;
}

/**
 * from → to の遷移を作る。from の root の末尾に仮のボタンを置き、その click に
 * navigate（to が画面）か openDialog（to がダイアログ）を書く。root が無ければ（仮の）縦並びの Box を作る。
 * 作った遷移の key を返す。
 */
export function addTransition(draft: Project, from: string, to: string): string {
  const all = containers(draft);
  const source = all.find((c) => c.container.id === from);
  const target = all.find((c) => c.container.id === to);
  if (!source) throw new Error(`画面・ダイアログ "${from}" がありません`);
  if (!target) throw new Error(`画面・ダイアログ "${to}" がありません`);
  const c = source.container;
  if (!c.root) {
    c.root = {
      id: "page",
      type: "Box",
      placeholder: true,
      props: { direction: "column", gap: 8 },
      children: [],
    };
  } else if (c.root.type !== "Box") {
    // 1 つの部品だけの root は、仮の Box で包んでから足す
    c.root = {
      id: uniqueId("page", nodeIds(c.root)),
      type: "Box",
      placeholder: true,
      props: { direction: "column", gap: 8 },
      children: [c.root],
    };
  }
  const action: Action =
    target.kind === "screen" ? { type: "navigate", to } : { type: "openDialog", dialog: to };
  const id = numberedId("btn", nodeIds(c.root));
  const label =
    target.kind === "screen" ? `${target.container.name}へ` : `${target.container.name}を開く`;
  c.root.children ??= [];
  c.root.children.push({
    id,
    type: "Button",
    placeholder: true,
    props: { label },
    events: { click: [action] },
  });
  return `${from}:${id}:click:0`;
}

/** 遷移を消す。アクションを消し、空になったイベントと仮の部品も消す。 */
export function deleteTransition(draft: Project, key: string): void {
  const t = findTransition(draft, key);
  if (!t) throw new Error("遷移が見つかりません");
  const list = listAt(draft, t);
  list.splice(Number(t.path.at(-1)), 1);
  mapActionLists(draft, (l) => l);
  pruneAll(draft);
}

/** 遷移のアクションが入っている配列（draft の中）。 */
export function listAt(draft: Project, t: Pick<Transition, "path">): Action[] {
  let cur: unknown = draft;
  for (const p of t.path.slice(0, -1)) cur = (cur as Record<string | number, unknown>)[p];
  if (!Array.isArray(cur)) throw new Error("遷移の場所が見つかりません");
  return cur as Action[];
}
