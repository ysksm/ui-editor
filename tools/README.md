# 既存ツールを触るための環境（#38）

#38「既存ノーコード／ローコードツールを実際に触る」で使う環境。自前で立てられるツールは、ツールごとのディレクトリに Docker Compose の定義を置いている。ツールと見るポイントは #1 のコメントを参照。

## 必要なもの

- Docker（Compose v2）。Docker Desktop・OrbStack・colima のどれでもよい
- メモリ: Penpot・Appsmith・ToolJet・Budibase・Lowcoder は 1 つあたり 1〜2 GB 前後使う。同時に立てるのは 2〜3 個までにして、使い終わったら止める
- ネット接続: イメージの取得に加え、GrapesJS・amis・LowCodeEngine は表示時に CDN からライブラリを読み込む

## 一覧

| タイプ | ツール                      | 環境                                             | URL                                  | 初回                                                                                                    |
| ------ | --------------------------- | ------------------------------------------------ | ------------------------------------ | ------------------------------------------------------------------------------------------------------- |
| A      | Figma（プロトタイプモード） | SaaS                                             | https://www.figma.com/               | 無料アカウントを作る                                                                                    |
| A      | Penpot                      | [`penpot/`](penpot/compose.yaml)                 | http://localhost:9001                | 画面からアカウント作成（メール確認なし）。送信メールは http://localhost:9011                            |
| B      | Puck                        | 本リポジトリ                                     | http://localhost:5174                | `pnpm --filter @ui-editor/editor-puck dev`。公式デモ: https://puckeditor.com/                           |
| B      | Craft.js                    | 本リポジトリ                                     | http://localhost:5175                | `pnpm --filter @ui-editor/editor-craft dev`。公式デモ: https://craft.js.org/                            |
| B      | GrapesJS                    | [`grapesjs/`](grapesjs/compose.yaml)             | http://localhost:9101                | なし（編集内容はブラウザの localStorage に保存）                                                        |
| C      | Plasmic                     | SaaS                                             | https://studio.plasmic.app/          | 無料アカウントを作る                                                                                    |
| C      | Builder.io                  | SaaS                                             | https://www.builder.io/              | 無料アカウントを作る                                                                                    |
| D      | Appsmith                    | [`appsmith/`](appsmith/compose.yaml)             | http://localhost:9002                | 画面から管理者アカウントを作成                                                                          |
| D      | ToolJet                     | [`tooljet/`](tooljet/compose.yaml)               | http://localhost:9003                | 画面から管理者アカウントを作成                                                                          |
| D      | Retool                      | SaaS                                             | https://retool.com/                  | 無料アカウントを作る（セルフホストはライセンスキーが要るので立てない）                                  |
| D      | Budibase                    | [`budibase/`](budibase/compose.yaml)             | http://localhost:9004                | 画面から管理者アカウントを作成                                                                          |
| D      | Lowcoder                    | [`lowcoder/`](lowcoder/compose.yaml)             | http://localhost:9005                | `admin@localhost` / `admin-local-dev`、または画面から登録                                               |
| E      | amis                        | [`amis-editor/`](amis-editor/compose.yaml)       | http://localhost:9102                | なし。公式のビジュアルエディタのデモ（ビルド済み）を配信                                                |
| E      | Alibaba LowCodeEngine       | [`lowcode-engine/`](lowcode-engine/compose.yaml) | http://localhost:9103                | なし。公式デモ（demo-general）をビルドして配信                                                          |
| F      | Onlook                      | 対象外（参考のみ）                               | https://github.com/onlook-dev/onlook | ローカル実行には Bun・Supabase・各種 API キーが要るため立てない。リポジトリの README と動画で方式を見る |

ポートは同時に立てても重ならないように、サーバー型は 9001〜9005・9011、ライブラリ型は 9101〜9103 に割り当てている。本リポジトリの Vite アプリ（5174〜5179）とも重ならない。

## 使い方

各ディレクトリで `docker compose` を実行する（リポジトリのルートからなら `-f` でファイルを指定する）。

```sh
# 起動（初回はイメージの取得・ビルドで数分かかる）
docker compose -f tools/appsmith/compose.yaml up -d

# ログを見る（起動完了の確認）
docker compose -f tools/appsmith/compose.yaml logs -f

# 停止（データは名前付きボリュームに残る）
docker compose -f tools/appsmith/compose.yaml down

# 停止してデータも消す
docker compose -f tools/appsmith/compose.yaml down -v
```

`amis-editor` と `lowcode-engine` は Dockerfile からビルドするので、初回は `up -d --build` になる（`up -d` だけでも初回は自動でビルドされる）。

## ツールごとの注意

- **Penpot**: 公式の compose ファイルをもとに、版の固定（`2.18.0`）・テレメトリー無効化・ポート変更だけを加えている。版は `PENPOT_VERSION=2.17.2 docker compose ...` のように変えられる。
- **ToolJet**: お試し用のオールインワンイメージ（`tooljet/try`、PostgreSQL などを内蔵）を使う。イメージは amd64 のみなので、Apple Silicon ではエミュレーションで動き、起動に数分かかる。
- **Budibase**: シングルイメージ版（`budibase/budibase`）。CouchDB・MinIO・Redis を内蔵する。
- **Lowcoder**: オールインワンイメージ。公式の `default.env` から必要な分だけを書き、共同編集（hocuspocus）とビデオ通話（Agora）は切っている。
- **amis**: amis-editor-demo リポジトリにあるビルド済みファイル（`demo-6.11.0/`）を取り出し、GitHub Pages 向けの絶対 URL をローカル用に書き換えて配信する。JSON だけで画面を表す方法は、エディタのコード（JSON）表示で確認できる。
- **LowCodeEngine**: lowcode-demo リポジトリは 2024 年で更新が止まっており、ビルドに Node 16 を使う。エンジン本体と UI ライブラリは CDN（alicdn）から読み込む。出码（コード生成）はデモ上部の「出码」ボタンから試せる。

## 版の固定

イメージ・リポジトリの版はすべて固定している（`latest` は使わない）。新しすぎる版は避け、公開から 2 週間ほど経った版を選んだ（ルートの pnpm の `minimumReleaseAge` と同じ考え方）。上げるときは各 `compose.yaml` / `Dockerfile` の版を書き換える。

| ツール        | 版                                                                                         |
| ------------- | ------------------------------------------------------------------------------------------ |
| Penpot        | `penpotapp/*:2.18.0`（PostgreSQL 15・Valkey 8.1・mailcatcher v0.11.0 を併用）              |
| Appsmith      | `appsmith/appsmith-ce:v2.4.3`                                                              |
| ToolJet       | `tooljet/try:v3.20.233-lts`                                                                |
| Budibase      | `budibase/budibase:v3.47.0`                                                                |
| Lowcoder      | `lowcoderorg/lowcoder-ce:2.7.6`                                                            |
| GrapesJS      | `grapesjs@0.23.6`、`grapesjs-preset-webpage@1.0.3`、`grapesjs-blocks-basic@1.0.2`（unpkg） |
| amis          | `aisuda/amis-editor-demo@5ff9717`（`demo-6.11.0`）                                         |
| LowCodeEngine | `alibaba/lowcode-demo@680a8b4`（`demo-general`）                                           |

## 動作確認の状況

作成時のマシンには Docker が無かったため、`docker compose up` での起動は未確認。確認したのは次のとおり。

- 各 `compose.yaml` が YAML として読めること、ホスト側ポートが重ならないこと
- 指定したイメージのタグが Docker Hub に存在し、arm64 に対応していること（ToolJet のみ amd64 のみ）
- GrapesJS のページをローカルの静的サーバーで開き、エディタ・ブロック・コード出力ボタンが表示されること

初めて起動したときに動かない設定があれば、このファイルと該当の `compose.yaml` を直す。
