# @ui-editor/schema

プロジェクトファイル（エディタの唯一の正）のスキーマ v0 と、題材アプリ「機器の設定＆モニタリング」のデータモデル・サンプルデータ。

```ts
import {
  loadProject, // テキスト → 検証済みプロジェクト
  serializeProject, // プロジェクト → テキスト（決定的）
  validateProject, // 値 → 形と参照を検証
  type Project,
} from "@ui-editor/schema";

const result = loadProject(text, "yaml");
if (!result.success) console.error(result.issues.map(formatIssue).join("\n"));
```

| export                                                  | 内容                                                                  |
| ------------------------------------------------------- | --------------------------------------------------------------------- |
| `Project` などの型、`ProjectSchema` などの zod スキーマ | スキーマ本体（`src/project/schema.ts`）                               |
| `validateProject` / `checkReferences` / `formatIssue`   | 形（zod）と参照の検証                                                 |
| `parseProjectText` / `loadProject` / `serializeProject` | JSON / YAML の読み書き                                                |
| `buildProjectJsonSchema`                                | JSON Schema。生成済みのものは `@ui-editor/schema/project.schema.json` |
| `extractExpressions` / `wholeExpression` など           | `{{ }}` バインディングの補助                                          |
| `Device` / `sampleData` など                            | 題材アプリのデータモデルとサンプルデータ（`src/domain/`）             |

## プロジェクトファイルの構造

```yaml
$schema: ../node_modules/@ui-editor/schema/project.schema.json # 任意（エディタ補完用）
schemaVersion: "0"
name: 機器モニタリング
entry: dashboard # 最初の画面。省略時は screens[0]
dataModel:
  source: | # データモデルの TS ソース（型定義のみ）
    interface Device { id: string; name: string }
state: # アプリ全体の状態 → {{ state.xxx }}
  selectedAlarmId: { type: "string | null", initial: null }
screens: # 画面
  - id: devices
    name: 機器一覧
    path: /devices
    events: { mount: [...] } # 画面を開いたとき
    root: <node>
  - id: deviceSettings
    name: 機器設定
    path: /devices/:deviceId # :xxx は params に宣言する
    params: { deviceId: { type: string } } # → {{ params.deviceId }}
    root: <node>
components: # 再利用する部品。id がノードの type になる
  - id: StatusBadge
    props: { status: { type: DeviceStatus } } # → {{ props.status }}
    root: <node>
dialogs: # ダイアログ（コンポーネントとは別物として扱う）
  - id: alarmDetail
    name: アラーム詳細
    params: { alarmId: { type: string } } # → {{ params.alarmId }}
    root: <node>
sampleData: # コレクション名 → レコードの配列 → {{ data.xxx }}
  devices: [...]
```

### node

```yaml
id: row # 画面・コンポーネント・ダイアログの中で一意
type: Box # 組み込み、またはコンポーネントの id
props: { text: "{{ device.name }}" } # 任意の JSON。文字列はバインディング可
style: { display: flex, gap: 8 } # 主要な CSS。数値は px
repeat: { each: "{{ data.devices }}", as: device, key: "{{ device.id }}" } # 繰り返し
visible: "{{ device.status !== 'offline' }}" # false なら描画しない
events: # イベント名 → 順に実行するアクション
  click:
    - { type: navigate, to: deviceSettings, params: { deviceId: "{{ device.id }}" } }
children: [<node>, ...]
```

組み込みの type（v0）:

| type          | 主な props                                                                  | イベント（`event` の中身）         |
| ------------- | --------------------------------------------------------------------------- | ---------------------------------- |
| `Box`         | —（レイアウト用のコンテナ）                                                 | `click`                            |
| `Text`        | `text`, `variant`（`title` / `body` / `caption`）                           | `click`                            |
| `Button`      | `label`, `variant`（`primary` / `secondary` / `danger`）, `disabled`        | `click`                            |
| `TextInput`   | `value`, `label`, `placeholder`, `disabled`                                 | `change`（`event.value: string`）  |
| `NumberInput` | `value`, `label`, `min`, `max`, `step`, `disabled`                          | `change`（`event.value: number`）  |
| `Checkbox`    | `checked`, `label`, `disabled`                                              | `change`（`event.value: boolean`） |
| `Table`       | `rows`（配列）, `columns`（`{ header, value }[]`、`value` は `row` を参照） | `rowClick`（`event.row`）          |

v0 では組み込みの props とイベント名はスキーマで縛らない（任意の JSON / 任意の名前）。どこまで縛るかは P2〜P4 で決める。

### バインディング

- 文字列中の `{{ 式 }}` を JS の式として評価する。式の中身は検証しない（`{{` と `}}` の対応と空の式だけ検査）。
- 文字列全体が 1 つの `{{ }}` なら、式の値をそのまま使う（`"{{ data.devices }}"` は配列）。それ以外は文字列に埋め込む。
- 参照できる名前:

| 名前     | 使える場所                    | 内容                                      |
| -------- | ----------------------------- | ----------------------------------------- |
| `data`   | どこでも                      | `sampleData`（`updateData` で更新される） |
| `state`  | どこでも                      | `state` の現在値                          |
| `params` | 画面・ダイアログの中          | 画面の params / ダイアログの params       |
| `props`  | コンポーネントの中            | インスタンスに渡された props              |
| `<as>`   | `repeat` したノードとその子孫 | 繰り返しの要素。`index` も使える          |
| `event`  | アクションの中                | イベントの値（上の表）                    |

### アクション（v0 は 5 種類）

| type          | フィールド                   | 内容                                                                  |
| ------------- | ---------------------------- | --------------------------------------------------------------------- |
| `navigate`    | `to`, `params?`              | 画面遷移。`to` は画面 id                                              |
| `openDialog`  | `dialog`, `params?`          | ダイアログを開く                                                      |
| `closeDialog` | —                            | 開いているダイアログを閉じる                                          |
| `setState`    | `path`, `value`              | `state` のドットパス（例: `draft.network.ip`）に値を入れる            |
| `updateData`  | `collection`, `match`, `set` | `data[collection]` のうち `match` に一致するレコードに `set` を上書き |

- `navigate.to` と `openDialog.dialog` はバインディング不可の固定 id。遷移図（P5）をファイルから静的に作れるようにするため。
- イベントに複数のアクションを並べると順に実行する。条件分岐や非同期はまだない。
- コンポーネントのインスタンスにも `events` を付けられる（ルート要素のイベントとして扱う）。コンポーネント側から独自イベントを発火する仕組みは v0 にはない。

## 検証

`validateProject` は 2 段階で検証し、問題の箇所をパス付きで返す。

1. 形: zod（`ProjectSchema`）。未知のキーもエラー（typo を拾うため `strictObject`）。
2. 参照: `checkReferences`
   - 画面・ダイアログ・コンポーネントの id の重複、画面 path の重複、ノード id の重複（ツリーごと）
   - `entry` / `navigate.to` / `openDialog.dialog` / ノードの `type` / `updateData.collection` / `setState.path` の先頭が存在するか
   - `navigate` / `openDialog` の params、コンポーネントの props が定義と合っているか（未定義のキー、`default` の無い必須の値の不足）
   - path の `:xxx` が params に宣言されているか、コンポーネントが自分自身を含んでいないか
   - `{{ }}` の対応

`dataModel.source` と `sampleData`・`state` の型の突き合わせはしない（P4 で TS 型を解釈するときに行う）。

## 読み書きと決定性

- `serializeProject(project, "json" | "yaml")` はキーを固定の順序で並べて書き出す。入力のキー順に関係なく同じ内容なら同じテキストになる（テストで確認）。
  - 順序: `$schema`, `schemaVersion`, `id`, `type`, `name`, … を先頭、`root` / `children` / `sampleData` を末尾、それ以外はアルファベット順（`src/project/io.ts` の `KEY_ORDER`）。
  - 配列の順序は変えない。`undefined` は書き出さない。
  - YAML は折り返しなし（`lineWidth: 0`）、アンカー／エイリアスなし。
- JSON → YAML → JSON で元の JSON と一致する。

### YAML を手で書くときの注意

`{{` で始まる値は必ずクォートする。クォートしないと YAML のマッピング（`{ { ... } }`）として解釈される。`parseProjectText` はこのパターンを見つけると行番号付きでエラーにする。

```yaml
text: "{{ device.name }}" # OK
text: {{ device.name }}   # NG
text: 名前: {{ device.name }} # OK（先頭が {{ でなければクォート不要）
```

## JSON Schema

`project.schema.json` は zod のスキーマから生成したもの（draft 2020-12）。スキーマを変えたら再生成する（古いままだとテストが失敗する）。

```sh
pnpm --filter @ui-editor/schema gen:json-schema
```

## v0 で追加・決定したこと（issue の案からの差分）

- `repeat`（繰り返し）と `visible`（条件表示）をノードに追加。一覧系の画面を書くために必要。
- 状態はアプリ全体の `state` のみ（画面ローカルの状態はない）。入力フォームは `state` に下書きを置いて `setState` で更新する。
- 画面の `events.mount` を追加。画面を開いたときに下書きを用意するなどに使う。
- データモデルは TS のソース文字列（`dataModel.source`）で持つ。型名参照の形式は採らない。
