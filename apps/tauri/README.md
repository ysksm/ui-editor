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
| `src/DesktopApp.tsx`              | P3 の `App` を包み、ローカルのファイルを開く・保存する                |
| `src/files.ts`                    | ファイルダイアログと fs プラグインでの読み書き（テストで差し替える）  |
| `src/main.tsx`                    | エントリ。P3 の `styles.css` もそのまま読み込む                       |
| `vite.config.ts`                  | 開発サーバーを 5179 に固定。react を 1 つにまとめる（`dedupe`）       |
| `src-tauri/tauri.conf.json`       | ウィンドウ・devUrl（5179）・`frontendDist`（`../dist`）・バンドル設定 |
| `src-tauri/capabilities/*.json`   | フロントエンドに許可する Tauri の API（権限）                         |
| `src-tauri/src/lib.rs`, `main.rs` | Rust 側のエントリ。dialog / fs プラグインを登録する                   |

## ローカルファイルの読み書き

- 上のバーの「ローカルのファイルを開く…」でファイルダイアログを出し、`.json` / `.yaml` を読み込む（P3 の `importProject` で検証する。通らなければエラーを出して開かない）。開くたびにエディタを作り直す。
- エディタの「JSON で保存」「YAML で保存」は、P3 の `App` の `onDownload`（書き出し先の差し替え口）につないで、ブラウザのダウンロードの代わりにローカルに書く。
  - 開いたファイルと同じ名前（＝同じ形式）なら、ダイアログを出さずに上書き保存する。
  - 同梱の題材を開いているとき・形式を変えたときは、保存ダイアログを出す（初期値は開いたファイルと同じフォルダ）。保存したパスが以後の上書き先になる。
- 権限（`capabilities/default.json`）は `dialog:allow-open` / `dialog:allow-save` と `fs:allow-read-text-file` / `fs:allow-write-text-file` だけ。fs の許可範囲（scope）は指定しておらず、ダイアログで選んだパスだけが実行時に許可範囲に入る（dialog プラグインが `allow_file` する）。フロントエンドから任意のパスは読めない。
- 動作確認: 読み書きの流れは `src/DesktopApp.test.tsx` でダイアログを差し替えて確認している（開く → 編集 → 同じパスへ上書き、形式を変えたときに保存先を聞く、検証エラー）。実アプリではリリースビルドの起動と画面の表示までを確認した。ネイティブのダイアログの操作は自動化していないので、手で確かめる。
- 制限: エディタのツールバーの「開く」（P3 の `<input type="file">`）も残っているが、こちらはパスが取れない。これで開いたあとの保存は、名前が変わるので上書きせずに保存先を聞く（バーのパス表示は保存するまで古いまま）。P3 に「開く」の差し替え口（`onOpen` など）があれば、ボタンを 1 つにまとめられる。

## Web 版との比較（評価メモ）

同じエディタ（P3）を、Web 版（`apps/editor-craft` を Vite で配信）と Tauri 版（このディレクトリ）で比べた。数値はこの端末（Apple Silicon の Mac、Rust 1.92）で測ったもの。

### ファイル操作

| 項目               | Web 版                                                                                                                   | Tauri 版                                                                                          |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------- |
| 開く               | `<input type="file">`。中身は読めるが、パスは分からない                                                                  | ネイティブのダイアログ。パスが分かる                                                              |
| 保存               | `<a download>` でダウンロード。毎回ダウンロードフォルダに新しいファイルができる（同名なら `(1)` が付く）。上書きできない | 開いたファイルに上書き保存できる。別名保存もダイアログで場所を選べる                              |
| 上書きの代わり     | File System Access API（`showSaveFilePicker`）なら上書きできるが、Chromium 系だけ（Safari・Firefox は非対応）            | 不要                                                                                              |
| 権限               | ブラウザが決める（ユーザーが選んだファイルだけ）                                                                         | capabilities で API ごとに許可する。今回は「ダイアログで選んだファイルだけ」にした                |
| そのまま動かない所 | —                                                                                                                        | macOS の WebView（WKWebView）では `<a download>` が何もしない。書き出し先の差し替え口が必須だった |

git で管理しているプロジェクトファイルを「開いて直して上書きする」運用なら、Tauri 版の方が素直。Web 版で同じことをするには File System Access API（Chromium 限定）か、ファイルを読み書きするサーバーが要る。

### 開発

| 項目                 | Web 版                   | Tauri 版                                                                                                                                     |
| -------------------- | ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| 必要なもの           | Node.js・pnpm            | それに加えて Rust・Xcode（macOS）。Windows は MSVC と WebView2、Linux は WebKitGTK                                                           |
| 開発起動             | Vite が約 0.1 秒で起動   | 初回は Rust のクレート約 350 本のコンパイルで約 20 秒。2 回目以降は数秒。フロントエンドは同じく HMR                                          |
| ビルド時間           | `vite build` 0.1〜0.2 秒 | `tauri build` 約 32 秒（フロントエンド＋リリースビルドの Rust。初回。2 回目以降は差分だけ）                                                  |
| ディスク             | `node_modules` だけ      | `src-tauri/target/` が 3.7 GB（デバッグとリリースの両方）                                                                                    |
| デバッグ             | ブラウザの DevTools      | 開発ビルドでは Web インスペクタが使える。Rust 側のログは端末に出る                                                                           |
| 依存のバージョン管理 | npm だけ                 | npm と Rust クレートのマイナーバージョンをそろえる必要がある。今回は 2.12 の公開直後で、そろえるのに手間取った（上の「Tauri のバージョン」） |
| テスト               | jsdom で完結             | 同じ（Tauri の API は差し替える）。ネイティブのダイアログを含む E2E は別の仕組み（WebDriver）が要る                                          |

### サイズ

| 項目     | Web 版                                   | Tauri 版                                                                                |
| -------- | ---------------------------------------- | --------------------------------------------------------------------------------------- |
| 配るもの | `dist/` 604 KB（JS 601 KB、gzip 172 KB） | `ui-editor.app` 9.7 MB（zip で 3.6 MB）。arm64 のみ                                     |
| 中身     | HTML・JS・CSS                            | Rust の実行ファイル 1 つに `dist/` を埋め込み。WebView は OS のものを使うので同梱しない |

Electron（Chromium を同梱して 100 MB 前後）と比べると 1 桁小さい。

### 配布

| 項目         | Web 版                              | Tauri 版                                                                                                                                                                 |
| ------------ | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 配り方       | 静的ホスティングに置いて URL を渡す | OS ごとのインストーラ（`.app` / `.dmg`、`.msi` / `.exe`、`.deb` / `.AppImage`）。OS ごとにその OS でビルドする（CI のマトリクス）                                        |
| 署名         | 不要                                | 今回のビルドは署名なし（ad-hoc）。ほかの Mac で開くと Gatekeeper に止められる。配るなら Apple の Developer ID での署名と公証（notarization）、Windows はコード署名が要る |
| 更新         | デプロイすれば全員が最新            | updater プラグインと更新サーバー（署名付きの配布物）を用意する。用意しなければ各自で入れ直し                                                                             |
| 描画エンジン | 利用者のブラウザ（主に Chromium）   | macOS は WebKit、Windows は WebView2（Chromium）、Linux は WebKitGTK。OS ごとに見た目や API の差を確かめる必要がある                                                     |

### まとめ

- P3 のエディタは、書き換えずにそのまま Tauri で動いた。差し替えが要ったのは保存先（`onDownload`）だけで、UI のコードは Web 版と共通にできる。
- Tauri にする利点は「ローカルのファイルを開いて上書き保存できる」ことに尽きる。プロジェクトファイルを唯一の正として git で管理する方針（#1）とは相性がよい。
- 代わりに、開発環境（Rust・数 GB のビルド）、OS ごとのビルドと署名、更新の仕組み、WebView の差の確認が増える。
- 当面は Web 版で進め、ローカルファイルの上書きが本当に必要になった時点で Tauri で包むのがよい。エディタ側は「開く」「保存」の差し替え口（`onOpen` / `onDownload`）を用意しておけば、包むときの変更は小さく済む。
