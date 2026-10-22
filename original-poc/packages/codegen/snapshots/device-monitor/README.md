# 機器の設定＆モニタリング

#1 の題材を poc-0 で書いたもの。データは機器の下に設定・メトリクス・アラームを入れ子で持つ。

Original PoC のエディタで作ったプロジェクトから生成したアプリ（Vite + React + TypeScript、react-router、Zustand）。
生成したコードは、本番の開発の土台としてそのまま書き換えてよい。

## 動かす

```sh
pnpm install
pnpm dev        # http://localhost:5181/
pnpm build      # 型の検査（tsc）とビルド
```

## 構成

| パス | 中身 |
| --- | --- |
| `src/model/types.ts` | エンティティの型・パラメータの型（ER から生成） |
| `src/model/schema.ts` | ER（検証・採番・入れ子・削除の規則に使う） |
| `src/model/data.ts` | サンプルデータと state の初期値 |
| `src/runtime/` | 入れ子のデータの CRUD（エディタのプレビューと同じ規則）・値の表示の補助 |
| `src/store/store.ts` | アプリの状態（Zustand）: データ・state・選択・ダイアログ・お知らせ |
| `src/store/records.ts` | エンティティごとのデータの変更（`createDevice` など） |
| `src/store/hooks.ts` | 画面で使う値（`useDataView`・`useUiState`・`useRecord`） |
| `src/ui/` | 組み込みの部品（Box・Text・Button・入力欄・Select・Table・Dialog） |

データはメモリの中だけにある（再読み込みでサンプルデータに戻る）。API につなぐときは `src/store/records.ts` と `src/store/store.ts` の「データの変更」を書き換える。

## エンティティ

| id | 名前 | 位置 |
| --- | --- | --- |
| `Device` | 機器 | ルート |
| `DeviceSettings` | 機器設定 | 機器の入れ子（`Device.settings`） |
| `Metric` | メトリクス | 機器の入れ子（`Device.metrics`） |
| `Alarm` | アラーム | 機器の入れ子（`Device.alarms`） |

---

`device-monitor` は poc-codegen で生成した。
