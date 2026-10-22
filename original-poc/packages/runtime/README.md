# @ui-editor/poc-runtime

プレビューの実行エンジン。UI に依存しない純粋関数で、操作のたびに新しい `RuntimeState` を返す。設計は [architecture.md](../../docs/architecture.md) の 6 章。

```ts
import { start, fireEvent, currentFrame, scopeFor } from "@ui-editor/poc-runtime";

let rt = start(project); // 最初の画面を開き、mount を実行
rt = fireEvent(project, rt, { frameId: currentFrame(rt)!.id, node: "toDevices", event: "click" });
```

| export                                                  | 内容                                                                                      |
| ------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `start` / `resetData`                                   | 最初の画面から始める・データを元のサンプルデータに戻す                                    |
| `fireEvent` / `runActions` / `back`                     | ノードのイベント → アクションの実行・戻る                                                 |
| `currentFrame` / `currentScreen` / `findFrame`          | 開いている画面・ダイアログ                                                                |
| `scopeFor` / `evaluate` / `resolve`                     | 描画用のスコープと式の評価（`@ui-editor/runtime` の `evaluateTemplate` / `resolveValue`） |
| `frameRecord` / `selectedRecords` / `requiresSatisfied` | 画面のレコード、選択中のレコード、`Button.requires`                                       |

## 状態

- `history`（画面の履歴）と `dialogs`（開いているダイアログ、最後が最前面）。フレームごとに `params`・フォームの `draft` / `errors`・ダイアログを開いた `onClose` と呼び出し元を持つ。
- `data`（プレビュー中のデータ。元のサンプルデータは書き換えない）、`state`、`selection`（エンティティ → 主キー）。
- `trail`（たどった遷移。key はフロー図の線の key と同じ）と `log`（300 件まで）。

## ふるまい

- **アクション**: 順に実行し、各アクションは直前の結果（データ・state）を見て評価する。`when` が偽なら飛ばし、失敗（式の誤り・検証エラー・restrict）したら残りを実行しない。
- **navigate**: 開いているダイアログを閉じてから移り、履歴に同じ画面があればそこまで戻す。移った先の `events.mount` を実行する。
- **openDialog / closeDialog**: ダイアログを重ねる。閉じた結果（既定 ok）の `onClose` のアクションを、openDialog を書いた側の文脈（params・event）で実行する。`back` はダイアログが開いていれば閉じる（cancel）。
- **表の rowSelect**: 表に `entity` があれば先に選択状態を変える（T3: 選択＋ボタン）。
- **CRUD**: `poc-datastore` で行い、変更（カスケード・setNull を含む）をログに残す。
- **フォーム**（`kind: form` と `entity`）: 開いたときにレコードがあれば複製（編集）、無ければ既定値（作成）で下書きを作る。`setDraft` で直し、`saveDraft` で検証して更新か作成（入れ子のエンティティは親を指す `ref` パラメータを親にする）。検証エラーは `errors` に入れて止める。
- **スコープ**: `data`（入れ子のエンティティは全親の子を並べた一覧）・`state`（`state.selection.X` はレコード）・`params`・`record`（entity と同じエンティティを指す `ref` パラメータで引く）・`draft`・`errors`・`event`・ループ変数。
