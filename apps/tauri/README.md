# tauri（P6: エディタを Tauri でデスクトップアプリにする）

#35 のプロトタイプ。P3 の画面エディタ（`apps/editor-craft`）を Tauri v2 で包み、デスクトップアプリとして動かす。P3 のコードは書き換えず、`@ui-editor/editor-craft` を workspace の依存にして `src/` から直接 import する。

## 開発起動

```sh
pnpm install
pnpm --filter @ui-editor/schema build   # 初回のみ（スキーマの dist を使う）
pnpm --filter @ui-editor/tauri tauri dev
```

- `tauri dev` が `beforeDevCommand`（`pnpm dev`）で Vite を http://localhost:5179 に立ち上げ、その URL をウィンドウで開く。フロントエンドの変更は HMR で反映される。
- 初回は Rust の依存（tauri など約 350 本のクレート）をまとめてコンパイルする。この端末（Apple Silicon）では約 20 秒だったが、マシンによっては数分かかる。`src-tauri/target/` は数 GB になる（`.gitignore` 済み）。2 回目以降は差分だけなので数秒で起動する。
- ブラウザだけで確認したいときは `pnpm --filter @ui-editor/tauri dev` で Vite だけを起動する（Tauri の API は使えない）。

## ビルド

```sh
pnpm --filter @ui-editor/tauri build         # フロントエンドだけ（dist/）。pnpm -r build はこれを呼ぶ
pnpm --filter @ui-editor/tauri tauri build   # アプリ本体（.app / .dmg）
```

- `tauri build` は `beforeBuildCommand`（`pnpm build`）で `dist/` を作り、リリースビルドの Rust と一緒に `src-tauri/target/release/bundle/` に `.app` と `.dmg` を出力する。
- `pnpm -r build` は Rust をコンパイルしない（CI やほかのプロトタイプの確認で重くならないように、フロントエンドだけにしている）。

## Tauri のバージョン

Tauri は 2.11 系に固定している（npm: `@tauri-apps/api ~2.11.0` / `@tauri-apps/cli ~2.11.5`、Rust: `tauri ~2.11`）。

- 最新の 2.12.0 は公開から 1 日経っておらず、pnpm の `minimumReleaseAge`（公開直後のパッケージを入れない安全装置）に引っかかる。例外リストに足すとルートの `pnpm-workspace.yaml` を触ることになり、安全装置も外れるので、期間を過ぎている 1 つ前に固定した。
- npm パッケージと Rust クレートはマイナーバージョンをそろえる必要がある（`tauri` CLI が不一致を検出する）。
- Rust 側は `tauri 2.11.6` が `tauri-runtime ^2.11.3` を要求するため、そのままだと 2.12.0 の `tauri-runtime` が選ばれ、コンパイルが通らない。`Cargo.lock` で `tauri-runtime` 2.11.3・`tauri-runtime-wry` 2.11.4・`tauri-utils` 2.9.3・`tauri-macros` / `tauri-codegen` / `tauri-plugin` 2.6.3 に固定している。`cargo update` をすると崩れるので、上げるときは 2.12 系にまとめて上げる。

## 構成

| ファイル                          | 内容                                                                  |
| --------------------------------- | --------------------------------------------------------------------- |
| `src/DesktopApp.tsx`              | P3 の `App` を題材ファイルで開く                                      |
| `src/main.tsx`                    | エントリ。P3 の `styles.css` もそのまま読み込む                       |
| `vite.config.ts`                  | 開発サーバーを 5179 に固定。react を 1 つにまとめる（`dedupe`）       |
| `src-tauri/tauri.conf.json`       | ウィンドウ・devUrl（5179）・`frontendDist`（`../dist`）・バンドル設定 |
| `src-tauri/capabilities/*.json`   | フロントエンドに許可する Tauri の API（権限）                         |
| `src-tauri/src/lib.rs`, `main.rs` | Rust 側のエントリ（`tauri init` の生成物ほぼそのまま）                |
