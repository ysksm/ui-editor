# ui-editor

UI エディタのプロトタイプ群を比較検証するための pnpm workspace モノレポ。

## 構成

| パス                   | 内容                             | フェーズ |
| ---------------------- | -------------------------------- | -------- |
| `packages/schema`      | プロジェクトスキーマと題材定義   | P0       |
| `packages/codegen`     | コード生成                       | P1       |
| `apps/editor-puck`     | Puck ベースのエディタ            | P2       |
| `apps/editor-craft`    | Craft.js ベースのエディタ        | P3       |
| `apps/runtime-preview` | ランタイムプレビュー             | P4       |
| `apps/flow`            | 画面遷移フロー                   | P5       |
| `apps/tauri`           | Tauri デスクトップ版（任意）     | P6       |
| `original-poc/`        | オリジナル PoC（自前のエディタ） | —        |

現時点で存在するのは `packages/schema` のみ。その他は各フェーズで追加する。

`original-poc/` は P0〜P6 の知見を土台にした自前のエディタの PoC。要求仕様とアーキテクチャは [`original-poc/README.md`](original-poc/README.md) から辿れる。

各ツールの思想・特徴・使い方の手順は、スライド [`docs/slides.html`](docs/slides.html)（ブラウザで開き、← → で移動）にまとめている。

既存のノーコード／ローコードツールを触るための環境（Docker Compose）は [`tools/`](tools/README.md) にある（#38）。

各プロトタイプの共通入力（題材アプリのプロジェクトファイル）は [`packages/schema/examples/`](packages/schema/examples/README.md) にある。スキーマの設計メモは [`packages/schema/README.md`](packages/schema/README.md)。

ルートの共通設定:

- `pnpm-workspace.yaml` … ワークスペース定義（`packages/*`, `apps/*`）
- `tsconfig.base.json` … 各パッケージが `extends` する TypeScript 共通設定
- `eslint.config.js` … ESLint（flat config + typescript-eslint）
- `.prettierrc.json` … Prettier

## 必要環境

- Node.js 20 以上
- pnpm 11（`corepack enable` で `packageManager` のバージョンが使われる）

## 起動方法

```sh
pnpm install
pnpm -r build    # 全パッケージをビルド
pnpm -r test     # 全パッケージのテスト（Vitest）
```

その他のスクリプト:

```sh
pnpm typecheck      # 型チェック
pnpm lint           # ESLint
pnpm format         # Prettier で整形
pnpm format:check   # 整形チェック
pnpm validate       # 題材のプロジェクトファイルを検証
```

特定のパッケージだけ実行する場合は `--filter` を使う:

```sh
pnpm --filter @ui-editor/schema test
```
