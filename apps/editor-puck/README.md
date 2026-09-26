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
