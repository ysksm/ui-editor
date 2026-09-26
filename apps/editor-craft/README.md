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
