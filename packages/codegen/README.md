# @ui-editor/codegen

プロジェクトファイル（`@ui-editor/schema` の v0）から Vite + React + TypeScript のアプリを生成する（#7 / P1）。

```sh
pnpm --filter @ui-editor/codegen build
pnpm --filter @ui-editor/codegen gen <project-file> --out <dir> [--name <app-name>] [--clean]
```

- `<project-file>` は `.json` / `.yaml`。読み込み時に `@ui-editor/schema` で検証し、問題があれば箇所を表示して終了する。
- `--name` は生成するアプリの `package.json` の name。省略時はファイル名から決める（`device-monitor.project.yaml` → `device-monitor`）。
- `--clean` は書き出す前に出力先の `src/` を消す。それ以外のファイル（`node_modules` など）には触らない。

生成したアプリは `pnpm install && pnpm dev` で起動する（ポート 5178 固定）。

## 決定性

同じプロジェクトファイルからは常に同じファイルを生成する。

- 生成は純粋な関数 `generate(project, { appName }) → { path, content }[]`（パスの順）。ファイルの書き出しは CLI 側。
- 全ファイルを Prettier（設定はリポジトリのルートと同じ、コード内に固定）で整形する。利用者の Prettier 設定は読まない。
- 依存ライブラリのバージョンはコード内に固定する（`src/app-template.ts`）。生成時に最新版を調べない。
- 日時・絶対パスなど、実行環境に依存する値は出力しない。

## テスト

| テスト           | 内容                                                                              |
| ---------------- | --------------------------------------------------------------------------------- |
| 決定性           | 同じ入力で 2 回生成し、全ファイルが一致する                                       |
| スナップショット | 生成結果が `snapshots/<題材>/` のファイルと一致する。余分なファイルがあっても失敗 |

`snapshots/` は生成したアプリそのもの（`node_modules` なし）なので、生成コードを読むときのサンプルも兼ねる。生成器を変えたら更新して diff を確認する。

```sh
pnpm --filter @ui-editor/codegen snapshots:update
```

題材は `src/examples.ts` の `EXAMPLES`（`fixtures/hello.project.yaml` と、schema の `device-monitor.project.yaml`）。

### 生成したアプリのビルド確認

ネットワークからのインストールが要るので `pnpm test` には含めない。題材ごとに `out/<題材>/` へ生成し、リポジトリの workspace とは別にインストールしてビルドする（`out/` は git 管理外）。

```sh
pnpm --filter @ui-editor/codegen build:examples            # 全題材
pnpm --filter @ui-editor/codegen build:examples hello      # 1 つだけ
```
