# @ui-editor/poc-model

オリジナル PoC のプロジェクトファイル（唯一の正）のスキーマ poc-0。設計は [architecture.md](../../docs/architecture.md) の 3・4 章。

| export                                                                                                                                          | 内容                                                          |
| ----------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| `Project` などの型、`ProjectSchema` などの zod スキーマ                                                                                         | スキーマ本体（`src/schema.ts`）                               |
| `validateShape`                                                                                                                                 | 形（zod）の検証。問題は場所（`path`）付き、メッセージは日本語 |
| `validateProject` / `checkProject`                                                                                                              | 形 ＋ 参照・整合性の検証（重大度付き）                        |
| `loadProject` / `serializeProject` / `migrate` / `createEmptyProject`                                                                           | 読み込み（移行 → 検証）と決定的な書き出し                     |
| `Issue` / `formatIssue` / `formatPath`                                                                                                          | 検証の問題（`error` / `warning`）                             |
| `walkData` / `checkFieldValue` / `checkFieldFormat`                                                                                             | 入れ子のデータをたどる・値を調べる（poc-datastore でも使う）  |
| `containers` / `walkNodes` / `walkActions`                                                                                                      | 画面・ダイアログ・ノード・アクションをたどる                  |
| `entityMap` / `nestParents` / `rootEntities`                                                                                                    | ER を引く                                                     |
| `extractExpressions` / `checkTemplate` など                                                                                                     | `{{ }}` の補助                                                |
| `addEntity` / `renameEntityId` / `deleteEntity` / `addField` / `updateField` / `renameField` / `deleteField` / `moveField` / `addRelation` など | ER の編集操作（`src/ops/er.ts`）                              |

## 形の検証

- zod の `strictObject` なので、未知のキーはエラーになる（キーの場所を指す）。
- `data` は「エンティティ id → レコード（任意のキー → JSON 値）の配列」とだけ検証する。入れ子の形・型・必須は参照の検証（`validateProject`）でエンティティ定義に沿って調べる。ノードの `props` も同じ。
- メッセージは zod の日本語ロケール。アクションの `type` のように判別できない値は、選べる値を示す。

## 参照・整合性の検証（`checkProject`）

形が正しいプロジェクトに対して行う。読み込みは止めず、問題を `error`（壊れている）と `warning`（作りかけで起きる・使われない指定）に分けて返す。

| 対象             | 主な検査                                                                                                                                                              |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ER               | id の重複、主キー（type: id）、表示用フィールド、enum の値、ref / children の相手、入れ子の親は 1 つ・循環しない、既定値の型、型に合わない指定（警告）                |
| データ           | ルートに置けるのは入れ子でないエンティティだけ、未知のフィールド、主キー（全体で一意）、必須、型、列挙値、範囲、子の形、ref の参照先、書式（警告）                    |
| state            | `selection` は予約語                                                                                                                                                  |
| 画面・ダイアログ | id の重複（画面とダイアログで共通）、entry、path の重複とパラメータ、entity、役割にエンティティが無い（警告）、params の ref                                          |
| ノード           | id の重複（画面ごと）、組み込みの type、発火しないイベント（警告）、`Button.requires`、`Table.entity` / `columns`、`{{ }}` の対応                                     |
| アクション       | 遷移先の有無と種類（画面は navigate、ダイアログは openDialog）、params、state のパス、エンティティ・フィールド、入れ子の作成の parent、下書きはフォームの中で（警告） |
| 遷移（警告）     | どこからも遷移してこない画面（最初の画面は除く）、どこからも呼ばれないダイアログ、仮の部品のままの遷移（FR-FLOW-06）                                                  |
| 配置情報         | 存在しない id（警告）                                                                                                                                                 |
| 式               | 式の中の `data.<X>` / `selection.<X>` のエンティティが無い（警告。id を変えたときの取り残し）                                                                         |

`onClose` の中のアクションは、`openDialog` を書いた画面・ダイアログで実行されるものとして検証する。

## 読み書き

- `loadProject(text)`: JSON を読み、`migrate` → 形 → 参照の順に検証する。JSON の構文エラーは `ProjectParseError` を投げる。対応していない `schemaVersion` は読み込まない。
- `serializeProject(project)`: キーを固定の順（`schemaVersion`・`id`・`type`・`name` … を先頭、`root` / `children` / `data` / `layout` を末尾、ほかはアルファベット順）に並べ、`undefined` を除いて `JSON.stringify(v, null, 2)` で書き出す。データのレコードはエンティティのフィールド順（入れ子の中も）、配置は id 順・整数。配列の順序は変えない。
- `migrate(raw)`: `MIGRATIONS`（前の版 → 次の版の関数）を今の版になるまで順に通す。互換が崩れる変更をしたら、ここに移行関数とテストを足す（architecture.md 4.11）。

## 編集操作（`src/ops/`）

エディタの変更はすべて `(draft: Project, …) => …` の関数で行う（immer のレシピとして使う。テストは immer の `produce` で行う）。前提を満たさない呼び出しは Error を投げ、エディタは先に `…Problem` 関数で理由を確かめて画面に出す。

| 操作                                                                                | 内容                                                                                                                                                                                                                                                                            |
| ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `addEntity` / `updateEntity` / `deleteEntity`                                       | エンティティの追加（主キー `id` だけを持つ）・名前と表示用フィールド・削除（それを指す ref / children のフィールドと値、入れ子のデータも消す）                                                                                                                                  |
| `renameEntityId`                                                                    | id を変え、フィールドの `entity`・`data` のキー・画面とパラメータ・表・ボタンの `requires`・アクションの `entity`・`layout.er` を書き換える。式の中は書き換えない（検証で警告）                                                                                                 |
| `addField` / `updateField` / `deleteField` / `moveField`                            | 属性の追加・変更（型を変えたら使わないキーを消し、入れ子でなくなったらデータも消す）・削除（値も消す。主キーは不可）・並べ替え                                                                                                                                                  |
| `renameField`                                                                       | id を変え、主キー・表示用フィールド・データのキー（入れ子の中も）・アクションの `values` / `match` / `set`・フォームの `setDraft` を書き換える                                                                                                                                  |
| `addRelation`                                                                       | `one-to-many` / `one-to-one` は親に `children`（`alarms` のような複数形）、`many-to-one` は子に `ref`（`deviceId`）を足す。入れ子にすると子の `data` 直下のレコードは消える（`relationDataLoss` で件数を示す）。入れ子の親は 1 つ・循環しない（`relationProblem`）              |
| `setEntityPosition` / `setErPositions`                                              | ER 図の配置（`layout.er`）                                                                                                                                                                                                                                                      |
| `addContainer` / `updateContainer` / `deleteContainer`                              | 画面・ダイアログの追加（`screen1` / `dialog1`、中身は空）・名前と path・削除（そこへの遷移と、空になった仮の部品も消す。`countTransitionsTo` で数を示す）                                                                                                                       |
| `renameContainerId`                                                                 | id を変え、`navigate.to` / `openDialog.dialog`（onClose の中も）・`entry`・`layout.flow` を書き換える。画面とダイアログで名前空間は共通（`containerIdProblem`）                                                                                                                 |
| `setEntry` / `setFlowPosition` / `setFlowPositions`                                 | 最初の画面、フロー図の配置（`layout.flow`）                                                                                                                                                                                                                                     |
| `mapActionLists` / `pruneAll`                                                       | すべてのアクション列を書き換える補助、イベントが空になった仮の部品を消す補助                                                                                                                                                                                                    |
| `extractTransitions` / `findTransition`（`src/flow.ts`）                            | 遷移の抽出（ノードのイベントの navigate / openDialog、画面の mount、onClose の中）。`key` は `<遷移元>:<ノード>:<イベント>:<位置>` で、ファイルには保存しない                                                                                                                   |
| `addTransition` / `deleteTransition`                                                | 線を引く = 遷移元の root の末尾に仮のボタン（`placeholder: true`）を置き、click に navigate / openDialog を書く（root が無ければ仮の Box）。消すと空になったイベントと仮の部品も消す                                                                                            |
| `setTrigger` / `triggerKind`                                                        | トリガーを変える: 遷移が入っているイベントのアクション列（付随アクションごと）を別の部品・イベントへ移す。T1 ボタン・T2 行クリック（表が無ければ仮の表）・T3 選択＋ボタン（表を選択できるようにし、ボタンに `requires`）・T5 mount。行・選択から遷移先の ref パラメータを埋める |
| `retargetTransition` / `setTransitionParams` / `setTransitionActions`               | 遷移先（navigate ↔ openDialog）・渡す値・アクション列。位置が変わる操作は新しい key を返す                                                                                                                                                                                      |
| `updateNodeProps`                                                                   | ノードの props の書き換え（ボタンの文言など）                                                                                                                                                                                                                                   |
| `applyTemplate` / `templateConflicts` / `recordParamName`（`src/ops/templates.ts`） | 役割（一覧・詳細・フォーム・確認）とエンティティから中身を作る。ランタイムが使う ref パラメータも足し、仮の部品は残す（下の「テンプレート」）                                                                                                                                   |

id は人が読める連番（`Entity1`、`field1`）。重なれば `alarms2` のように番号を付ける（`src/ops/ids.ts`）。

## テンプレート（`applyTemplate`）

画面・ダイアログに役割（kind）とエンティティを設定し、役割ごとのテンプレートで `root` を作る（D3・FR-GEN-04）。式は null を考慮する（生成コードで `strictNullChecks` を有効にするため）。ノード id は決定的。

| 役割             | 中身                                                                                                                                                                                    | パラメータ                                                                 |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| 一覧（list）     | タイトル、操作ボタンの並び（仮の部品）、表（`{{ data.X }}`・選択できる・列は表示用フィールドから 4 つ）                                                                                 | —                                                                          |
| 詳細（detail）   | タイトル（`{{ record?.name ?? "" }}`）、項目（参照は参照先の表示名、真偽ははい／いいえ）、入れ子の子（配列は表 `{{ record?.alarms ?? [] }}`、1 件は項目）                               | `<x>Id`（ref・必須）                                                       |
| フォーム（form） | 項目ごとの入力欄（文字列・日付は TextInput、数値は NumberInput、真偽は Checkbox、列挙・参照は Select）。値は `draft`、エラーは `errors`。保存（`saveDraft` → 閉じる／戻る）・キャンセル | `<x>Id`（ref・任意。無ければ作成）。入れ子のエンティティは親の `<親>Id` も |
| 確認（confirm）  | 「〈表示名〉を削除しますか？」、削除する（`deleteRecord` → 閉じる／戻る）・キャンセル                                                                                                   | `<x>Id`（ref・必須）                                                       |

- 仮の部品は操作ボタンの並びに移して残す（遷移を消さない）。一覧では、仮の表のイベント（行クリックなど）をテンプレートの表に移す。
- 仮の部品でない中身は置き換わる。エディタは `templateConflicts` で数を示して確かめる。
- 生成した部品への遷移の結びつけ（例: 一覧の表の行クリック → 詳細、確認の「削除する」→ 一覧へ）は、遷移パネルのトリガーの変更（`setTrigger`）で行う。`poc-runtime` の `templates.scenario.test.ts` で、この組み立てだけで編集・保存とカスケード削除が動くことを確かめている。
