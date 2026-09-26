# @ui-editor/editor-puck（P2）

[Puck](https://puckeditor.com/)（`@puckeditor/core`）に乗って作る画面エディタのプロトタイプ（#13）。

```sh
pnpm --filter @ui-editor/editor-puck dev   # http://localhost:5174
```

## パーツ

Puck のコンポーネント名は P0 の node の `type` と同じにしている（変換で名前を読み替えないため）。

| 分類                 | Puck のコンポーネント                                    | 備考                                                     |
| -------------------- | -------------------------------------------------------- | -------------------------------------------------------- |
| レイアウト           | `Box`（表示名 Container）                                | 子を置ける（Puck の `slot` フィールド）。flex のコンテナ |
| 基本                 | `Text` / `Button` / `Table`                              |                                                          |
| 入力                 | `TextInput`（表示名 Input） / `NumberInput` / `Checkbox` |                                                          |
| 題材のコンポーネント | `StatusBadge` / `MetricCard` / `AlarmRow`                | P2-1 では題材ファイルの定義を手書きの React で再現       |

- issue の「Card」は P0 の組み込みに無いため、パーツとしては作っていない（`Box` に枠線のスタイルを付けたもの、または P2-4 のコンポーネントで代替する）。
- 値の欄は固定値でも `{{ 式 }}` でも入れられる。キャンバスではバインディングを評価せず、式のまま表示する。
- すべて `inline: true` にし、Puck のラッパー div を挟まないようにしている。ラッパーがあると flex の子要素がラッパーになり、子の幅や `flexGrow` が効かないため。

## スタイルの編集（P2-2）

右パネルの「スタイル」で width / height / padding / margin / display / flexDirection / flexWrap / justifyContent / alignItems / gap / flexGrow を編集できる。キャンバスにはその場で反映される。

**判断: 独自パネルではなく、Puck の fields（`object` フィールド＋カスタム欄）で作った。**

- `style` を 1 つの `object` フィールドにし、中身を長さ用・列挙用・数値用のカスタム欄にした（`src/puck/style-field.tsx`）。
  - 長さ: `200` → 数値（px）、`100%` / `4px 8px` / `auto` → 文字列のまま。P0 の `Length`（`number | string`）にそのまま入る。
  - 列挙: 選択肢は P0 の `StyleSchema` から取る。先頭の「（未設定）」で消せる。Puck 標準の `select` は「未設定」を表しにくいのでカスタムにした。
- 良かった点: 選択中のパーツ・Undo/Redo・パンくずなど、Puck の右パネルの仕組みにそのまま乗れる。実装は 100 行程度。
- 良くなかった点:
  - `object` フィールドは入れ子のグループとして縦に並ぶだけで、「幅・高さを横並び」「flex のときだけ flex 系を出す」のようなレイアウトは標準では組めない（`resolveFields` で出し分けはできるが、見た目は変えられない）。Figma のようなスタイルパネルにしたいなら `overrides.fields` で右パネルごと差し替えることになり、そこまで行くと独自パネルとほぼ同じ。
  - Puck 標準の `select` / `number` は「値なし」を扱いにくく、結局ほとんどカスタム欄になった。
- `object` フィールドは既存の値に変更したキーだけを上書きするので、欄に無いキー（`border` など）は保たれる。
