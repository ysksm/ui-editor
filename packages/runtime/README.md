# @ui-editor/runtime

P4（#25）の評価エンジン。UI に依存しない部分をまとめ、ほかのプロトタイプからも使えるようにする。

| export                                 | 内容                                                                                 |
| -------------------------------------- | ------------------------------------------------------------------------------------ |
| `parseDataModel(source)`               | `dataModel.source` の TS 型を TypeScript Compiler API で解析し、フィールド一覧にする |
| `parseTypeExpression(text)`            | 型式 1 つを解析する（フォーム入力用）                                                |
| `printDataModel(decls)` / `formatType` | 解析結果を TS ソースに書き出す                                                       |
| `checkSampleData` / `checkValue`       | サンプルデータ・値がデータモデルの型に合うか検査する                                 |
| `modelForCollection` / `defaultValue`  | コレクション名に対応する型、型に合う初期値                                           |
| `isModelDecl` / `referencedNames`      | オブジェクト型か（= データモデルとして扱うか）、参照している型名                     |

## TS 型の解析

- 型チェッカーは使わず構文木だけを見る（ブラウザで lib.d.ts なしに動かすため）。
- 対応する型: `string` / `number` / `boolean` / `null` / `undefined` / `unknown`、リテラル型、`T[]` / `Array<T>`、オブジェクト型リテラル、ユニオン、同じソース内の型名の参照。
- 非対応（診断を出す）: ジェネリクス、`extends`、交差型、`Record` などのユーティリティ型、メソッド。
- 構文エラーは `ts.transpileModule` の診断、未定義の型名は独自に検出する。

## サンプルデータの型検査

- スキーマ v0 にはコレクションと型を結ぶ定義が無いので、名前の規約で対応付ける（`deviceSettings` → `DeviceSettings`、`devices` → `Device`）。#2 に報告済み。
- 型の不一致・必須フィールドの欠落・型に無いフィールドを、値の中のパス付きで返す。ユニオンはどれか 1 つに合えばよい。
- 警告は保存を妨げない（プロジェクトファイルの検証とは別）。
