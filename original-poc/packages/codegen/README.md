# @ui-editor/poc-codegen

poc-0 のプロジェクトから Vite + React + TypeScript のアプリを生成する（本番の開発の土台）。設計は [architecture.md](../../docs/architecture.md) の 4.12。

```ts
import { generate } from "@ui-editor/poc-codegen";

const files = await generate(project, { appName: "device-monitor" }); // { path, content }[]（パスの順）
```

- `generate` はファイルを読み書きしない（ブラウザのエディタからも呼ぶ）。整形は `prettier/standalone` で、CLI とブラウザで同じ出力になる。
- プロジェクトに検証エラーがあるとき、生成するコードの名前とぶつかるエンティティ id（`Values`・`Record` など）があるときは `GenerateError`（`problems` に理由）。
- Node だけで使うもの（`readProjectFile`・`writeFiles`・題材の一覧 `EXAMPLES`）は `@ui-editor/poc-codegen/node`。

## 生成するアプリ

| パス                                    | 中身                                                                                                         | 生成 / 固定 |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------ | ----------- |
| `src/model/types.ts`                    | エンティティの型・`Values<E>`・`Dataset`・`DataView`・`UiState`・`ScopeState`・画面とダイアログのパラメータ  | 生成        |
| `src/model/schema.ts`・`data.ts`        | ER（データ操作の規則）・サンプルデータと state の初期値                                                      | 生成        |
| `src/store/records.ts`                  | エンティティごとのデータの変更（`createDevice`・`createAlarm(parentId, …)`・`updateDevice`・`deleteDevice`） | 生成        |
| `src/runtime/datastore.ts`・`values.ts` | 入れ子のデータの CRUD（poc-datastore と同じ規則）・値の表示の補助                                            | 固定        |
| `src/store/store.ts`・`hooks.ts`        | Zustand のストア（データ・state・選択・ダイアログの重なり・お知らせ）・画面で使う値のフック                  | 固定        |
| `src/ui/*`                              | 組み込みの部品（Box・Text・Button・TextInput・NumberInput・Checkbox・Select・Table・Dialog・NoticeBar）      | 固定        |
| `src/App.tsx`                           | トップ画面（今は件数を出す仮のもの。画面・ダイアログ・ルートは OP6-4）                                       | 生成        |

固定のファイルは `templates/` に実物を置き、`pnpm embed` で `src/templates.generated.ts`（文字列の定数）に埋め込む。`templates/` を直したら `pnpm embed` を実行する（ずれはテストで検出）。

## テスト

| コマンド                | 内容                                                                                                                       |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `pnpm test`             | 題材の生成結果のスナップショット（`snapshots/`）、決定性、入力の検査、固定のデータ操作と poc-datastore の結果の一致        |
| `pnpm snapshots:update` | スナップショットを更新する                                                                                                 |
| `pnpm build:example`    | 題材から生成したアプリを `out/device-monitor` に書き、ワークスペースの外のアプリとしてインストールして `tsc && vite build` |

`build:example` はネットワークを使うので `pnpm test` には入れない。生成したアプリは `out/device-monitor` で `pnpm dev` / `pnpm preview`（ポート 5181）で動かせる。
