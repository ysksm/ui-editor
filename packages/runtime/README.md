# @ui-editor/runtime

P4（#25）の評価エンジン。UI に依存しない部分をまとめ、ほかのプロトタイプからも使えるようにする。

| export                                 | 内容                                                                                 |
| -------------------------------------- | ------------------------------------------------------------------------------------ |
| `parseDataModel(source)`               | `dataModel.source` の TS 型を TypeScript Compiler API で解析し、フィールド一覧にする |
| `parseTypeExpression(text)`            | 型式 1 つを解析する（フォーム入力用）                                                |
| `printDataModel(decls)` / `formatType` | 解析結果を TS ソースに書き出す                                                       |
| `isModelDecl` / `referencedNames`      | オブジェクト型か（= データモデルとして扱うか）、参照している型名                     |

## TS 型の解析

- 型チェッカーは使わず構文木だけを見る（ブラウザで lib.d.ts なしに動かすため）。
- 対応する型: `string` / `number` / `boolean` / `null` / `undefined` / `unknown`、リテラル型、`T[]` / `Array<T>`、オブジェクト型リテラル、ユニオン、同じソース内の型名の参照。
- 非対応（診断を出す）: ジェネリクス、`extends`、交差型、`Record` などのユーティリティ型、メソッド。
- 構文エラーは `ts.transpileModule` の診断、未定義の型名は独自に検出する。
