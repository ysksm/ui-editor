# @ui-editor/editor-puck（P2）

[Puck](https://puckeditor.com/)（`@puckeditor/core`）に乗って作る画面エディタのプロトタイプ（#13）。

```sh
pnpm --filter @ui-editor/editor-puck dev   # http://localhost:5174
```

## パーツ

Puck のコンポーネント名は P0 の node の `type` と同じにしている（変換で名前を読み替えないため）。

| 分類           | Puck のコンポーネント                                                             | 備考                                                                      |
| -------------- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| レイアウト     | `Box`（表示名 Container）                                                         | 子を置ける（Puck の `slot` フィールド）。flex のコンテナ                  |
| 基本           | `Text` / `Button` / `Table`                                                       |                                                                           |
| 入力           | `TextInput`（表示名 Input） / `NumberInput` / `Checkbox`                          |                                                                           |
| コンポーネント | プロジェクトの `components`（題材では `StatusBadge` / `MetricCard` / `AlarmRow`） | P2-4 から定義（`components`）を読んで生成。P2-1 では手書きの React だった |

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
- 画面・ダイアログ・コンポーネントをタブで切り替えて編集する。

### 変換の方式（`src/convert/convert.ts`）

| P0 の node                                                    | Puck の item                                                |
| ------------------------------------------------------------- | ----------------------------------------------------------- |
| `type`                                                        | `type`（コンポーネント名が同じなので読み替えなし）          |
| `id`                                                          | `props.id`                                                  |
| `props.xxx`                                                   | `props.xxx`（平らに展開。Puck の欄がそのまま props を編集） |
| `style`                                                       | `props.style`（P2-2 の object フィールド）                  |
| `children`（`Box`）                                           | `props.children`（Puck の slot）                            |
| `repeat` / `visible` / `events`、`Box` 以外の `children` など | `props._p0` に退避（Puck では編集しない。戻すときに復元）   |

- 1 つのツリー（画面・ダイアログ・コンポーネントの `root`）を 1 つの Puck データにする。
  - root が `Box` のとき（画面・ダイアログはすべてこれ）: root の Box を Puck の **root** に対応させ、子を root の slot（`items`）に入れる。一番外に置いたパーツがそのまま root の Box の子になる。Puck は読み込み時に root の `id` を消すので、node の id は `nodeId` に入れる。
  - それ以外（`Text` を root にしたコンポーネントなど）: `content = [root]` とし、Puck の root は空の入れ物にする。一番外に 2 つ以上置くと警告を出し、その間の編集はプロジェクトに反映しない。
  - P2-3 では常に `content = [root]` にしていたが、空の Container の端にドロップすると一番外に置かれて「root が 2 つ」になりやすかったため、P2-4 で上の形に変えた。
- Puck は内部で `root` という id を使うので、P0 の id `root` は `_p0_root` にして渡す（`_` 始まりは P0 の id に使えないので衝突しない）。
- テスト（`convert.test.ts`）: 題材ファイルのすべての画面・ダイアログ・コンポーネントを Puck のデータにして戻し、`serializeProject` の結果が元のファイルと 1 文字も違わないことを確認（Puck の `migrate` を通した場合も）。ブラウザでも「読込 → 全タブを開く → 保存」で YAML・JSON とも元ファイルと一致した。

### 変換で失われる・変わる情報

- 題材ファイルの範囲では失われる情報は無い。
- 空の `props: {}` / `style: {}` / `children: []` は書き出さない（意味は同じ）。欄を空にしたキーも消える。
- Puck で新しく置いたパーツの id は Puck が振る `Text-<uuid>` になる（P0 の id として有効だが読みにくい）。
- 値の欄（`valueField`）は `12` / `true` / `null` / `[...]` / `{...}` を JSON として読むので、文字列の `"12"` を入れたいときは入れられない（text / label などの文字列専用の欄は影響なし）。
- コメントやフロースタイルは P0 の `serializeProject` の時点で消える（P0 の README の通り）。

## コンポーネント／ダイアログの作成（P2-4、追加目標）

- ツールバーの「＋ 新規」でコンポーネント（id は PascalCase）・ダイアログを作り、そのタブで中身を Puck で組み立てる。
- コンポーネント・ダイアログのタブでは、上に **props / params の定義** の欄が出る（名前・TS の型・既定値）。中のパーツからは `{{ props.名前 }}` / `{{ params.名前 }}` で参照する。
- プロジェクトの `components` は、Puck のパレットの「コンポーネント」に自動で並ぶ（`createConfig`）。インスタンスの右パネルの欄は props の定義から作る。
- キャンバスでは、インスタンスの中身を P0 の定義から直接描く（`src/render/NodeView.tsx`）。このとき `{{ props.xxx }}` だけを評価する（`src/render/evaluate.ts`）。`data` / `state` / `repeat` の変数はエディタに値が無いので、式のまま表示する。
  - props の値そのものが式のとき（`status: "{{ device.status }}"`）は、中で評価できなかった所にその式を表示する。
  - style で評価できない値は消す（式の文字列を CSS に入れても無効なため）。color / backgroundColor は片方が消えたら両方消す（白文字だけ残って見えなくなるため）。
- **選択をコンポーネント化**（Puck のヘッダー右）: 選択中のパーツとその子孫をコンポーネントにし、元の場所をインスタンスに置き換える。
  - `repeat` / `visible` / `events`（どこに・何回・どう置くか）はインスタンス側に残し、見た目（type / props / style / children）を中身にする。
  - 中身の式が外側の変数（`device` など）を参照している場合は、props を定義して式を書き換える必要がある（自動では引数にしない）。
- 編集中のコンポーネント自身と、それを使っているコンポーネントはパレットから外す（入れると循環する）。
- 確認: 「＋ 新規」で `TempCard`（温度カード）を作り、props（label / value / unit）を定義、Text 2 つと padding・width を設定 → S1 のメトリクスカードの隣に置いて label・value を入れる → 保存すると検証を通る P0 ファイルになる（ブラウザで約 40 秒の操作）。

### まだできないこと

- コンポーネント・ダイアログの削除・改名（参照の書き換えが要る）。
- ダイアログを開くアクション（`openDialog`）の設定。イベント／アクションの編集は P2 の範囲外。ダイアログはキャンバス上では普通の Box として表示する（モーダルの見た目ではない）。
- コンポーネントから独自イベントを出す、子を差し込む（slot）。P0 のスキーマにも無い。

### 気づいた点

- props の定義の順番は保存時に変わる（P0 の `serializeProject` はキーを `KEY_ORDER` → アルファベット順に並べるため、`label / value / unit` が `value / label / unit` になる）。props の定義は順番に意味があるので、P0 へのフィードバック候補。
- Puck の root の `id` は Puck が読み込み時に消し、P0 の id `root` は Puck の内部の id と衝突した。どちらも実際に動かすまで分からなかった。
