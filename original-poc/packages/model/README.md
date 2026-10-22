# @ui-editor/poc-model

オリジナル PoC のプロジェクトファイル（唯一の正）のスキーマ poc-0。設計は [architecture.md](../../docs/architecture.md) の 3・4 章。

| export                                                                | 内容                                                          |
| --------------------------------------------------------------------- | ------------------------------------------------------------- |
| `Project` などの型、`ProjectSchema` などの zod スキーマ               | スキーマ本体（`src/schema.ts`）                               |
| `validateShape`                                                       | 形（zod）の検証。問題は場所（`path`）付き、メッセージは日本語 |
| `validateProject` / `checkProject`                                    | 形 ＋ 参照・整合性の検証（重大度付き）                        |
| `loadProject` / `serializeProject` / `migrate` / `createEmptyProject` | 読み込み（移行 → 検証）と決定的な書き出し                     |
| `Issue` / `formatIssue` / `formatPath`                                | 検証の問題（`error` / `warning`）                             |
| `walkData` / `checkFieldValue` / `checkFieldFormat`                   | 入れ子のデータをたどる・値を調べる（poc-datastore でも使う）  |
| `containers` / `walkNodes` / `walkActions`                            | 画面・ダイアログ・ノード・アクションをたどる                  |
| `entityMap` / `nestParents` / `rootEntities`                          | ER を引く                                                     |
| `extractExpressions` / `checkTemplate` など                           | `{{ }}` の補助                                                |

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
| 配置情報         | 存在しない id（警告）                                                                                                                                                 |
| 式               | 式の中の `data.<X>` / `selection.<X>` のエンティティが無い（警告。id を変えたときの取り残し）                                                                         |

`onClose` の中のアクションは、`openDialog` を書いた画面・ダイアログで実行されるものとして検証する。

## 読み書き

- `loadProject(text)`: JSON を読み、`migrate` → 形 → 参照の順に検証する。JSON の構文エラーは `ProjectParseError` を投げる。対応していない `schemaVersion` は読み込まない。
- `serializeProject(project)`: キーを固定の順（`schemaVersion`・`id`・`type`・`name` … を先頭、`root` / `children` / `data` / `layout` を末尾、ほかはアルファベット順）に並べ、`undefined` を除いて `JSON.stringify(v, null, 2)` で書き出す。データのレコードはエンティティのフィールド順（入れ子の中も）、配置は id 順・整数。配列の順序は変えない。
- `migrate(raw)`: `MIGRATIONS`（前の版 → 次の版の関数）を今の版になるまで順に通す。互換が崩れる変更をしたら、ここに移行関数とテストを足す（architecture.md 4.11）。
