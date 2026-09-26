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

## P0 形式との変換・保存（P2-3）

- 起動時はブラウザに保存した作業中のプロジェクト（localStorage、編集のたびに保存）、無ければ題材ファイル（`packages/schema/examples/device-monitor.project.yaml`）を開く。
- ツールバー: 「開く…」で `.json` / `.yaml` を読み込み（`loadProject` で検証し、エラーはパス付きで表示）、「題材を読み込む」で題材ファイルに戻す、「保存」で P0 形式（YAML / JSON）をダウンロード。保存前に `validateProject` で検証する。
- 画面・ダイアログをタブで切り替えて編集する（コンポーネントは P2-4）。

### 変換の方式（`src/convert/convert.ts`）

| P0 の node                                                    | Puck の item                                                |
| ------------------------------------------------------------- | ----------------------------------------------------------- |
| `type`                                                        | `type`（コンポーネント名が同じなので読み替えなし）          |
| `id`                                                          | `props.id`                                                  |
| `props.xxx`                                                   | `props.xxx`（平らに展開。Puck の欄がそのまま props を編集） |
| `style`                                                       | `props.style`（P2-2 の object フィールド）                  |
| `children`（`Box`）                                           | `props.children`（Puck の slot）                            |
| `repeat` / `visible` / `events`、`Box` 以外の `children` など | `props._p0` に退避（Puck では編集しない。戻すときに復元）   |

- 1 つのツリー（画面・ダイアログ・コンポーネントの `root`）を 1 つの Puck データにする。P0 の root は 1 つ、Puck の `content` は配列なので `content = [root]` とし、Puck の root は空の入れ物にした。一番外に 2 つ以上置くと警告を出し、その間の編集はプロジェクトに反映しない。
- テスト（`convert.test.ts`）: 題材ファイルのすべての画面・ダイアログ・コンポーネントを Puck のデータにして戻し、`serializeProject` の結果が元のファイルと 1 文字も違わないことを確認（Puck の `migrate` を通した場合も）。ブラウザでも「読込 → 全タブを開く → 保存」で YAML・JSON とも元ファイルと一致した。

### 変換で失われる・変わる情報

- 題材ファイルの範囲では失われる情報は無い。
- 空の `props: {}` / `style: {}` / `children: []` は書き出さない（意味は同じ）。欄を空にしたキーも消える。
- Puck で新しく置いたパーツの id は Puck が振る `Text-<uuid>` になる（P0 の id として有効だが読みにくい）。
- 値の欄（`valueField`）は `12` / `true` / `null` / `[...]` / `{...}` を JSON として読むので、文字列の `"12"` を入れたいときは入れられない（text / label などの文字列専用の欄は影響なし）。
- コメントやフロースタイルは P0 の `serializeProject` の時点で消える（P0 の README の通り）。
- Puck の config に無い `type`（題材の 3 つ以外のコンポーネント）はまだ描画できない（P2-4 でプロジェクトのコンポーネント定義から作る）。
