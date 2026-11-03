# @ui-editor/poc-mcp

Original PoC のプロジェクトファイル（`*.poc.json`）を AI クライアントから操作する MCP サーバー。エディタの画面を介さずに、ER → サンプルデータ → 画面・遷移 → コードの書き出しまでを行える。

標準入出力で動き、状態を持たない。ツールは呼ばれるたびにファイルを読み、編集して、検証してから保存する。

## 準備

```sh
pnpm install
pnpm --filter "./original-poc/packages/**" build
```

## クライアントの設定

`--root` には絶対パスを書く。読み書きできるのはこのフォルダの中だけで、省略するとサーバーのカレントディレクトリになる。

```json
{
  "mcpServers": {
    "ui-editor-poc": {
      "command": "node",
      "args": [
        "/path/to/ui-editor/original-poc/packages/mcp/dist/cli.js",
        "--root",
        "/path/to/workspace"
      ]
    }
  }
}
```

Claude Code なら、次のコマンドでも登録できる。

```sh
claude mcp add ui-editor-poc -- node /path/to/ui-editor/original-poc/packages/mcp/dist/cli.js --root /path/to/workspace
```

## ツール

| 分類         | ツール                                                                                                                      |
| ------------ | --------------------------------------------------------------------------------------------------------------------------- |
| プロジェクト | `create_project`・`get_project`・`validate_project`                                                                         |
| ER           | `add_entity`・`update_entity`・`delete_entity`・`add_field`・`update_field`・`delete_field`・`add_relation`                 |
| データ       | `generate_sample_data`                                                                                                      |
| 画面         | `generate_screens`・`add_container`・`delete_container`・`set_entry`・`add_node`・`update_node`・`move_node`・`remove_node` |
| 遷移         | `list_transitions`・`add_transition`・`set_trigger`・`set_transition_params`・`delete_transition`                           |
| 書き出し     | `export_code`                                                                                                               |

編集のツールは、結果と一緒にプロジェクト全体の検証の結果（`issues`）を返す。

## 動きの決まり

- **保存:** 形が壊れる編集は保存しない。参照のエラーは作りかけで普通に起きるので、保存して `issues` で返す。
- **書き出し:** 検証エラーや式の誤りがあれば、場所付きの理由を返して書き出さない。出力はエディタ・CLI と同じ。
- **範囲:** `--root` の外のパスは、シンボリックリンクを経由するものも含めて拒否する。
- **上書き:** `export_code` は、空でないフォルダには `overwrite: true` が無いと書き出さない。`overwrite` でも、出力に無いファイルは消さない。
- **エディタとの関係:** エディタはブラウザの中に作業内容を持つので、MCP での変更は開いている画面に反映されない。編集のあとは「開く」でファイルを開き直す。逆に、エディタの変更は「保存」するまでファイルに入らない。
- **同じファイルの同時編集:** 別のプロセスと同時に書くと、あとの保存が勝つ。

## 開発

```sh
pnpm --filter @ui-editor/poc-mcp build
pnpm --filter @ui-editor/poc-mcp test
```

標準出力はプロトコルが使うので、ログは標準エラーに出す。
