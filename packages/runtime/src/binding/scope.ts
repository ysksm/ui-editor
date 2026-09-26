import type { Scope } from "./expression.js";

/**
 * 式のスコープを組み立てる。
 *
 * | 名前     | 内容                                   | 使える場所                     |
 * | -------- | -------------------------------------- | ------------------------------ |
 * | `data`   | サンプルデータ（`updateData` で更新）  | どこでも                       |
 * | `state`  | アプリ全体の状態（`setState` で更新）  | どこでも                       |
 * | `params` | 画面・ダイアログの引数                 | 画面・ダイアログの中           |
 * | `props`  | コンポーネントに渡された props         | コンポーネントの中             |
 * | `event`  | イベントの値（`event.value` など）     | アクションの中                 |
 * | ループ変数 | `repeat.as` の名前と `index`         | repeat したノードとその子孫    |
 * | `row`    | 表の行                                 | `Table` の `columns[].value`   |
 *
 * 後から足した名前が優先される（ループの入れ子では内側が優先）。
 */
export interface ScopeParts {
  data: unknown;
  state: unknown;
  params?: unknown;
  props?: unknown;
  event?: unknown;
  /** ループ変数など、任意の名前。 */
  locals?: Readonly<Record<string, unknown>> | undefined;
}

export function createScope(parts: ScopeParts): Scope {
  const scope: Record<string, unknown> = { data: parts.data, state: parts.state };
  if (parts.params !== undefined) scope.params = parts.params;
  if (parts.props !== undefined) scope.props = parts.props;
  if (parts.event !== undefined) scope.event = parts.event;
  return { ...scope, ...parts.locals };
}

/** スコープに名前を足したものを返す（ループ変数・イベント引数用）。 */
export function extendScope(scope: Scope, locals: Readonly<Record<string, unknown>>): Scope {
  return { ...scope, ...locals };
}
