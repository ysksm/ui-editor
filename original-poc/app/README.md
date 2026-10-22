# @ui-editor/poc-app

オリジナル PoC のエディタ。設計は [architecture.md](../docs/architecture.md) の 4・5 章。

```sh
pnpm --filter "./original-poc/packages/**" build   # ライブラリを先にビルド
pnpm --filter @ui-editor/poc-app dev               # http://localhost:5180/
```

## 構成

| パス                        | 内容                                                                                                             |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `src/state/store.ts`        | Zustand のストア。`project`・履歴・ファイル・未保存フラグ・ビューと選択・通知。変更は `edit(label, recipe)` だけ |
| `src/state/history.ts`      | immer の `produceWithPatches` で逆パッチを積む Undo / Redo（200 件まで）                                         |
| `src/state/files.ts`        | 開く・保存（File System Access API、無ければ `<input type="file">` とダウンロード）                              |
| `src/state/autosave.ts`     | localStorage への自動保存（編集のあと 0.5 秒）と、起動時の復元                                                   |
| `src/state/issue-target.ts` | 検証の問題の場所から、開くビューと選ぶものを決める                                                               |
| `src/components/`           | ヘッダー（ファイル操作・Undo/Redo・検証の件数）、ビュー切替、通知、確認ダイアログ、検証パネル                    |
| `src/views/`                | ER / データ / フロー / 画面のビュー                                                                              |

## 操作

- **ファイル**: 新規・開く・題材を開く・保存（開いたファイルに上書き。保存先が無ければ選ぶ）・名前を付けて保存。未保存の変更があるときに新規・開くを押すと、画面内のダイアログで確かめる（ブラウザの `confirm` は自動操作を止めるので使わない）。
- **ショートカット**: Cmd/Ctrl + Z（元に戻す）、Shift + Cmd/Ctrl + Z・Ctrl + Y（やり直す）、Cmd/Ctrl + S（保存。Shift で名前を付けて保存）。入力欄の中の Cmd/Ctrl + Z はブラウザの文字の取り消しに任せる。
- **自動保存**: 編集のたびに localStorage に書き、次に開いたときに復元する（無ければ題材を開く）。File System Access API の保存先は復元できないので、復元後の保存は保存先を選び直す。
- **検証**: ヘッダーの「エラー n・警告 m」で検証パネルを開く。行を選ぶと、該当のビューを開いてエンティティ・画面などを選ぶ。
