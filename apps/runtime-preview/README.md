# @ui-editor/runtime-preview

P4（#25）: データ・バインディング・アクションを実行時に解釈して動かすプレビュー（社内ツールビルダー型）。
題材ファイル `packages/schema/examples/device-monitor.project.yaml` を読み込んで動く。

```sh
pnpm --filter @ui-editor/runtime-preview dev   # http://localhost:5176
pnpm --filter @ui-editor/runtime-preview test
```

評価エンジン（TS 型の解析など、UI に依存しない部分）は [`packages/runtime`](../../packages/runtime) にある。

## 画面

| タブ         | 内容                                                                                                                                                                                            |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| データモデル | `dataModel.source` の型の一覧（オブジェクト型 = データモデル、それ以外 = 型）と詳細。フォームでフィールドを追加・編集すると TS ソースを書き出す（簡易スキーマ定義 UI）。TS ソースの直接編集も可 |
