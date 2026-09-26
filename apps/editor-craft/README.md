# editor-craft（P3: Craft.js の画面エディタ）

#19 のプロトタイプ。Craft.js（エディタを組み立てるためのフレームワーク）で、パレット・キャンバス・レイヤー・プロパティパネルを自前で組んだ画面エディタ。

```sh
pnpm --filter @ui-editor/schema build   # 初回のみ（スキーマの dist を使う）
pnpm --filter @ui-editor/editor-craft dev   # http://localhost:5175
```

起動すると題材ファイル（`packages/schema/examples/device-monitor.project.json`）を開く。

## 構成

| ファイル                   | 内容                                                                   |
| -------------------------- | ---------------------------------------------------------------------- |
| `src/project/convert.ts`   | P0 のノード ⇔ Craft.js のシリアライズ形式の変換                        |
| `src/project/documents.ts` | 画面・コンポーネント・ダイアログ（エディタで開く単位）の一覧と差し替え |
| `src/project/evaluate.ts`  | キャンバス表示用の `{{ }}` の評価（評価できなければ文字列のまま）      |
| `src/parts/view.tsx`       | パーツの見た目（キャンバスとコンポーネントのプレビューで共通）         |
| `src/parts/craft.tsx`      | Craft.js の resolver に登録するコンポーネント                          |
| `src/editor/*`             | パレット・レイヤー・プロパティパネル                                   |

- 状態は P0 のプロジェクト（`Project`）を正として持ち、開いているドキュメントだけを Craft.js に読み込む。Craft の状態が変わるたびに P0 形式に戻してプロジェクトに書き戻す。
- コンポーネントのインスタンスは 1 種類の Craft コンポーネント（`ComponentInstance`）で表す（Craft の resolver は起動時に固定されるため）。

## 保存・読込（P0 形式）

ツールバーの「開く」で `.json` / `.yaml` を読み込み（`loadProject` で検証）、「JSON で保存」「YAML で保存」で `serializeProject` の出力をダウンロードする。保存時に `validateProject` で検証し、問題があれば一覧を表示する（書き出しはする）。

### Craft.js の形式との対応

| P0                                                  | Craft.js（`SerializedNodes`）                                                                 |
| --------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| ノード 1 つ                                         | ノード 1 つ。Craft の id はルートが `ROOT`、それ以外は P0 の id（重複時は `~2` などを付ける） |
| `type`（組み込み）                                  | `type.resolvedName`（Box / Text / …）                                                         |
| `type`（コンポーネント）                            | `resolvedName: "ComponentInstance"` ＋ `props.component`                                      |
| `id`                                                | `props.nodeId`                                                                                |
| `props` / `style` / `repeat` / `visible` / `events` | `props` の同名キーにそのまま                                                                  |
| `children`（Box）                                   | `isCanvas: true` と `nodes`                                                                   |
| `children`（Box 以外）                              | `custom.p0Children` に退避してそのまま戻す                                                    |

画面の `name` / `path` / `params` / `events`、コンポーネントの `props` 定義、`dataModel` / `state` / `sampleData` は Craft に渡さず、P0 のプロジェクトにそのまま残す。Craft に読み込むのは開いているドキュメントの `root` だけ。

### 変換で失われる情報

- 題材ファイル（全画面・コンポーネント・ダイアログ）は、読込 → Craft.js に読み込み → 保存でファイルとバイト単位で一致する（`src/project/roundtrip.test.tsx`。JSON → JSON、JSON → YAML、YAML → JSON）。
- 失われるのは Craft.js 側だけの情報: `hidden`、`linkedNodes`、選択状態、undo 履歴（ドキュメントを切り替えると消える）。いずれも P0 に対応するものが無い。
- エディタで作ったノードで id を空にしたもの・重複したものは、保存時に `<type の先頭小文字><連番>`（例: `text1`）を付け直す。
- キー順・書式は `serializeProject` が決めるので、手書きの YAML のコメントやキー順は保存すると消える（P0 の仕様どおり）。
