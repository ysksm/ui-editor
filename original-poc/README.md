# original-poc

画面遷移と ER 図から動くアプリを組み立てる、オリジナル実装の UI エディタ（PoC）。既存ライブラリのエディタに乗らず、P0〜P6 の知見を土台に自前で作る。

- 要求仕様: [docs/requirements.html](docs/requirements.html)（ブラウザで開く）。13 章「確認したいこと」の結果は [アーキテクチャ](docs/architecture.md) の 1 章にある。
- アーキテクチャ: [docs/architecture.md](docs/architecture.md)（パッケージ構成・スキーマ poc-0・設計判断・作業計画）

## 構成

| パス                 | パッケージ                 | 内容                                                   |
| -------------------- | -------------------------- | ------------------------------------------------------ |
| `packages/model`     | `@ui-editor/poc-model`     | スキーマ poc-0・検証・読み書き・編集操作・テンプレート |
| `packages/datastore` | `@ui-editor/poc-datastore` | 入れ子のサンプルデータの CRUD・参照・カスケード        |
| `packages/seed`      | `@ui-editor/poc-seed`      | ER からのサンプルデータ生成                            |
| `packages/runtime`   | `@ui-editor/poc-runtime`   | プレビューの実行エンジン                               |
| `packages/codegen`   | `@ui-editor/poc-codegen`   | poc-0 → React アプリのコード生成                       |
| `app`                | `@ui-editor/poc-app`       | エディタ（ER 図・データ・フロー図・画面・プレビュー）  |
| `examples`           | —                          | 題材「機器の設定＆モニタリング」の poc-0 版            |

各パッケージはステップごとに追加する（作業計画はアーキテクチャの 8 章）。

## ポート

| 用途                   | ポート |
| ---------------------- | ------ |
| エディタ（`app`）      | 5180   |
| 生成したアプリの確認用 | 5181   |
