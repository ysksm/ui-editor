# @ui-editor/poc-model

オリジナル PoC のプロジェクトファイル（唯一の正）のスキーマ poc-0。設計は [architecture.md](../../docs/architecture.md) の 3・4 章。

| export                                                  | 内容                                                          |
| ------------------------------------------------------- | ------------------------------------------------------------- |
| `Project` などの型、`ProjectSchema` などの zod スキーマ | スキーマ本体（`src/schema.ts`）                               |
| `validateShape`                                         | 形（zod）の検証。問題は場所（`path`）付き、メッセージは日本語 |
| `Issue` / `formatIssue` / `formatPath`                  | 検証の問題（`error` / `warning`）                             |

## 形の検証

- zod の `strictObject` なので、未知のキーはエラーになる（キーの場所を指す）。
- `data` は「エンティティ id → レコード（任意のキー → JSON 値）の配列」とだけ検証する。入れ子の形・型・必須は参照の検証（`validateProject`）でエンティティ定義に沿って調べる。ノードの `props` も同じ。
- メッセージは zod の日本語ロケール。アクションの `type` のように判別できない値は、選べる値を示す。
