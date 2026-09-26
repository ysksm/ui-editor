# ui-editor

UI エディタのプロトタイプ群を比較検証するための pnpm workspace モノレポ。

## 構成

| パス                   | 内容                           | フェーズ |
| ---------------------- | ------------------------------ | -------- |
| `packages/schema`      | プロジェクトスキーマと題材定義 | P0       |
| `packages/codegen`     | コード生成                     | P1       |
| `apps/editor-puck`     | Puck ベースのエディタ          | P2       |
| `apps/editor-craft`    | Craft.js ベースのエディタ      | P3       |
| `apps/runtime-preview` | ランタイムプレビュー           | P4       |
| `apps/flow`            | 画面遷移フロー                 | P5       |
| `apps/tauri`           | Tauri デスクトップ版（任意）   | P6       |

現時点で存在するのは `packages/schema` のみ。その他は各フェーズで追加する。

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
