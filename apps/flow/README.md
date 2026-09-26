# @ui-editor/flow（P5 画面遷移図）

Figma のプロトタイプモードのように、画面・ダイアログをノード、イベント → `navigate` / `openDialog` をエッジとして表示するプロトタイプ（#31）。

## 起動

```sh
pnpm install
pnpm --filter @ui-editor/schema build   # 初回のみ（flow は schema の dist を読む）
pnpm --filter @ui-editor/flow dev       # http://localhost:5177/
```

## できること（P5-1）

- 題材ファイル [`device-monitor.project.json`](../../packages/schema/examples/device-monitor.project.json) を読み込んで遷移図を描く。ツールバーの「ファイルを開く」で他の P0 形式のファイル（JSON / YAML）も読める
- ノード: 画面・ダイアログのノードツリーを簡易なワイヤーフレームで描く（バインディングは評価せず、式を短く表示）。`repeat` は `×n`、式の `visible` は `if` のバッジ
- エッジ: 遷移の起点パーツ（ボタン・カード・テーブル行など）から出る。`navigate` は実線、`openDialog` は破線。ラベルはイベント名
- 自動レイアウト（dagre、左 → 右）と手動配置。ドラッグ後に「配置を保存」で `layouts/<名前>.layout.json` に書き込む

## 構成

| ファイル                   | 内容                                                                             |
| -------------------------- | -------------------------------------------------------------------------------- |
| `src/graph/extract.ts`     | P0 のプロジェクト → ノード（画面・ダイアログ）と遷移。遷移ごとに起点の住所を持つ |
| `src/graph/layout.ts`      | dagre による自動配置と、保存済み位置とのマージ                                   |
| `src/graph/layout-file.ts` | 配置ファイルの読み書き                                                           |
| `src/nodes/`               | 画面ノードとワイヤーフレーム                                                     |
| `vite.config.ts`           | 配置ファイルを書き込む開発サーバー用 API（`POST /api/layout?name=`）             |
| `layouts/`                 | 保存した手動配置位置                                                             |

### 遷移の取り出し方

- アクションの置き場所: 画面の `events`（`mount`）、画面・ダイアログ内の各ノードの `events`、コンポーネント内のノードの `events`（インスタンスを置いた画面・ダイアログから出る遷移として扱う）
- 遷移の id は起点の住所（`screen:dashboard/alarmRow#click[0]` = 画面 `dashboard` のノード `alarmRow` の `click` の 0 番目のアクション）。P5-2 で遷移を追加・削除するときにこの住所で P0 データを書き換える
- `closeDialog` は遷移先が決まらない（開いた元に戻る）ので、エッジにしない

### 手動配置位置の置き場所

スキーマ v0 には配置位置を保存する場所が無い（プロジェクトは未知のキーを許さない）。`packages/schema` は変更しない方針なので、`apps/flow/layouts/` に別ファイルとして保存する。書き込みは開発サーバーの API で行うため、`vite preview` などでは代わりにファイルとしてダウンロードする。

## 評価メモ

P5-3（#34）で書く。
