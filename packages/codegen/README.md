# @ui-editor/codegen

プロジェクトファイル（`@ui-editor/schema` の v0）から Vite + React + TypeScript + CSS Modules のアプリを生成する（#7 / P1）。

```sh
pnpm --filter @ui-editor/codegen build
pnpm --filter @ui-editor/codegen gen <project-file> --out <dir> [--name <app-name>] [--clean]
```

- `<project-file>` は `.json` / `.yaml`。読み込み時に `@ui-editor/schema` で検証し、問題があれば箇所を表示して終了する。
- `--name` は生成するアプリの `package.json` の name。省略時はファイル名から決める（`device-monitor.project.yaml` → `device-monitor`）。
- `--clean` は書き出す前に出力先の `src/` を消す。それ以外のファイル（`node_modules` など）には触らない。

生成したアプリは `pnpm install && pnpm dev` で起動する（ポート 5178 固定）。題材から生成したものは [`snapshots/device-monitor/`](snapshots/device-monitor/) にそのまま置いてある。

## 生成コードの仕様（案）

### ディレクトリ構成

```
<app>/
  package.json / vite.config.ts / tsconfig.json / index.html / .prettierrc.json / .gitignore
  src/
    main.tsx                 エントリ（固定）
    App.tsx                  BrowserRouter + ルート + DialogHost
    routes.tsx               ルート定義（1 画面 = 1 <Route>）
    paths.ts                 画面 → URL（navigate で使う）
    model.ts                 データモデル（dataModel.source に export を付けたもの）
    index.css                リセット程度のグローバル CSS（固定）
    store/
      appStore.ts            Zustand のストア（data / state / dialog とアクション）
      sampleData.ts          Data 型とサンプルデータ
    screens/<Id>Screen.tsx   画面（+ <Id>Screen.module.css）
    components/<Id>.tsx      コンポーネント（+ <Id>.module.css）
    dialogs/<Id>Dialog.tsx   ダイアログ（+ <Id>Dialog.module.css）
    dialogs/DialogHost.tsx   開いているダイアログを描画する
    ui/                      組み込みの部品（Text / Button / 入力 / Table / Dialog）。使ったものだけ
```

### 命名規則

| 対象                        | 規則                                       | 例                                             |
| --------------------------- | ------------------------------------------ | ---------------------------------------------- |
| 画面コンポーネント          | 画面 id を PascalCase + `Screen`           | `deviceSettings` → `DeviceSettingsScreen`      |
| 画面の params 型            | `<画面コンポーネント>Params`               | `DeviceSettingsScreenParams`                   |
| ダイアログ                  | ダイアログ id を PascalCase + `Dialog`     | `saveConfirm` → `SaveConfirmDialog`            |
| ダイアログの props / params | `<ダイアログ>Props` / `<ダイアログ>Params` | `SaveConfirmDialogProps`                       |
| コンポーネント              | コンポーネント id のまま                   | `StatusBadge`、props 型は `StatusBadgeProps`   |
| CSS Modules のクラス        | ノード id を camelCase（ツリー内で一意）   | `deviceCard` → `styles.deviceCard`             |
| URL                         | `paths.<画面 id を camelCase>(params)`     | `paths.deviceSettings({ deviceId })`           |
| イベント                    | `on` + イベント名の先頭を大文字            | `click` → `onClick`、`rowClick` → `onRowClick` |

### 変換規則

| プロジェクトファイル                     | 生成コード                                                                                                              |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `Box`                                    | `<div>`                                                                                                                 |
| `Text` の `text` / `Button` の `label`   | `<Text>` / `<Button>` の子（`{式}` を含むテキスト）                                                                     |
| その他の組み込み                         | `src/ui/` の部品。props はそのまま属性に                                                                                |
| コンポーネントのインスタンス             | `<StatusBadge status={device.status} />`（props は定義の順）                                                            |
| `style`（固定値）                        | `<ファイル名>.module.css` のクラス。数値は px（`flex` / `fontWeight` などは単位なし）                                   |
| `style`（`{{ }}` を含む値）              | `style={{ color: … }}`                                                                                                  |
| `"{{ 式 }}"`（全体が 1 つ）              | 式をそのまま（`{data.devices}`）                                                                                        |
| `"… {{ 式 }} …"`                         | テンプレートリテラル（属性）/ JSX のテキストと `{式}`（子）                                                             |
| `repeat: { each, as, key }`              | `{each.map((as) => <… key={key}>)}`（key が無ければ index）                                                             |
| `visible: false` / `visible: "{{ 式 }}"` | 出力しない / `{式 && <…>}`                                                                                              |
| `data` / `state`                         | `const data = useAppStore((store) => store.data)`（参照したものだけ）                                                   |
| 画面の `params` / ダイアログの `params`  | `useParams()` から作る / ダイアログの props                                                                             |
| `navigate`                               | `navigate(paths.deviceSettings({ deviceId: device.id }))`                                                               |
| `openDialog` / `closeDialog`             | `openDialog({ id: "alarmDetail", params: { alarmId: alarm.id } })` / ダイアログの中は `onClose()`、外は `closeDialog()` |
| `setState` / `updateData`                | `setState("draftSettings.network.ip", event.value)` / `updateData("alarms", { id: … }, { acknowledged: true })`         |
| 画面の `events.mount`                    | `useEffect(() => { … }, [params.deviceId])`                                                                             |
| インスタンスの `events`                  | コンポーネントの props に `onClick?: () => void` を足し、ルート要素に渡す                                               |

式は書き換えずに埋め込み、生成コード側で `data` / `state` / `params` / `props` / repeat の `as` / Table の `row` / `event` を同じ名前の変数にしている。式は acorn で構文解析し、構文エラーやスコープに無い名前（`window` なども）を参照している式は**生成時にエラー**にする（場所と式を表示）。

### ルーティングとダイアログ

- **react-router を使う**。ルート定義は `src/routes.tsx` の 1 ファイル。URL は `src/paths.ts` の関数で作る。
  - 使わない場合は「現在の画面 id + params」をストアに持って `switch` で出し分けることになるが、URL（ブラウザの戻る・リロード・直接アクセス）を自前で扱うことになり、生成コードも読みにくくなるので採らなかった。
- **ダイアログの開閉はストアで管理する**（画面ローカルの state にしない）。ストアに `dialog: OpenDialog | null`（`{ id: "saveConfirm"; params: SaveConfirmDialogParams } | …` の判別共用体）と `openDialog` / `closeDialog` を持ち、`App` 直下の `DialogHost` が開いているダイアログを描画する。
  - 理由: `openDialog` は画面（やコンポーネント）から、`closeDialog` はダイアログの中から呼ばれ、呼ぶ場所がツリー上で離れている。画面ローカルにすると開閉の関数を props で渡し回すことになる。スキーマの `closeDialog` がダイアログを指定しない（同時に開くのは 1 つ）こととも合う。
  - ダイアログの中の `closeDialog` は props の `onClose()` にする（ダイアログ単体でも使えるように）。
- 1 つのイベントの複数のアクションは、ハンドラの中に順に並べる。式は描画時の値（クロージャ）を読むので、同じハンドラの中で `setState` した値を後のアクションで読むことはできない（題材では起きない）。
- 画面の `events.mount` は params が変わったとき（同じ画面のまま別の機器を開いたなど）も実行する。
- 生成アプリの tsconfig は `strict` だが `strictNullChecks: false`。プロジェクトファイルの式が null を考慮していないことがある（D1 の OK で `state.draftSettings.network` を読む。型は `DeviceSettings | null`）ため。

## 決定性

同じプロジェクトファイルからは常に同じファイルを生成する。

- 生成は純粋な関数 `generate(project, { appName }) → { path, content }[]`（パスの順）。ファイルの書き出しは CLI 側。
- 全ファイルを Prettier（設定はリポジトリのルートと同じ、コード内に固定）で整形する。利用者の Prettier 設定は読まない。
- 依存ライブラリのバージョンはコード内に固定する（`src/app-template.ts`）。生成時に最新版を調べない。
- 日時・絶対パスなど、実行環境に依存する値は出力しない。import は「外部パッケージ → 相対パス」のアルファベット順、フックの宣言も固定の順。

## ストア: Zustand と Redux Toolkit の比較（追加目標）

`generateRtkStore(project)` で、`src/store/appStore.ts` と同じ機能を Redux Toolkit で書いたものを出力できる（比較用。アプリには組み込まない）。題材の出力は [`snapshots/rtk-store/device-monitor/src/store/appStore.ts`](snapshots/rtk-store/device-monitor/src/store/appStore.ts)。生成アプリの中に置いて `tsc` が通ること、dispatch で state・data・dialog が更新されることは確認した。

|                      | Zustand（採用）                                           | Redux Toolkit                                                                  |
| -------------------- | --------------------------------------------------------- | ------------------------------------------------------------------------------ |
| ストアの行数（題材） | 72 行                                                     | 79 行                                                                          |
| 依存                 | `zustand`                                                 | `@reduxjs/toolkit` + `react-redux`                                             |
| アプリ側の準備       | なし                                                      | `main.tsx` で `<Provider store={store}>`                                       |
| 値を読む             | `useAppStore((store) => store.data)`                      | `useAppSelector((root) => root.data)`                                          |
| アクションを呼ぶ     | `setState("draftSettings.network.ip", event.value)`       | `dispatch(setState({ path: "draftSettings.network.ip", value: event.value }))` |
| 更新の書き方         | コピーして返す（`setIn` / `map` を自前で書く）            | Immer で直接書き換え（reducer は読みやすい）                                   |
| 型                   | `updateData` の match / fields をコレクションの型で縛れる | payload はコレクションごとの型で縛りにくい（`Record<string, unknown>`）        |
| 開発ツール           | devtools ミドルウェアを足せば Redux DevTools で見られる   | 標準で Redux DevTools・ミドルウェア・RTK Query                                 |

- 生成コードとしては **Zustand の方が読みやすい**。呼び出し側が `dispatch(action({ … }))` にならず、Provider も要らない。画面ごとの差分（呼び出し側）の方がストア本体より量が多いので、ここが効く。
- RTK の利点（Immer・DevTools・RTK Query）は、手で育てていく段階やサーバー状態を扱う段階で効く。将来 API から取得するときは、どちらを選んでもサーバー状態は TanStack Query（または RTK Query）に分け、`data` はそちらから読む形にするのがよい。差し替えポイントは `appStore.ts` の `data: sampleData` の行（コメントあり）。

## 評価メモ

### 題材アプリの担当範囲を作れたか（かかった時間）

作れた。題材の `device-monitor.project.yaml` から生成したアプリが `tsc && vite build` でビルドでき、S1〜S3・D1・D2・コンポーネント 3 つが表示され、3 つのフロー（S2 → S3、S3 保存 → D1 → 設定更新、S1 アラーム → D2 → 確認済み）が動く（ヘッドレス Chrome で確認）。AI 実装で 5 PR。#8 の着手から #11 のマージ（動くアプリ）まで約 20 分、評価メモ（#12）まで約 25 分（着手前の設計の検討は含まない）。

### 生成コード: 人間が読めるか・同じ入力から同じ出力になるか

- 決定性: 2 回生成して全ファイル一致をテストで確認している。生成結果は `snapshots/` と比較し、差があればテストが失敗する。
- 読みやすさ: 手で書いた React とほぼ同じ形になった。[`DashboardScreen.tsx`](snapshots/device-monitor/src/screens/DashboardScreen.tsx) は 86 行、一番長い [`DeviceSettingsScreen.tsx`](snapshots/device-monitor/src/screens/DeviceSettingsScreen.tsx) で 118 行。

**読みやすい点**

- 1 画面 / 1 コンポーネント / 1 ダイアログ = 1 ファイル。CSS も同名の `.module.css` で、クラス名がノード id（エディタ上の名前）と一致する。
- 式がプロジェクトファイルに書いたままの形で出てくる（`{device.name}`、`{props.value} {props.unit}`）。エディタで書いた式を探しやすい。
- 使っているものだけ宣言する（`data` を読まない画面にはストアのフックが無い、`index` を使わない `map` には `index` が無い）。
- 型が付いている: コンポーネントの props、画面・ダイアログの params、`OpenDialog` の判別共用体、`Data` 型。`strictNullChecks` 以外は strict で通る。
- 組み込みの部品（`src/ui/`）は生成せず手書きのものをコピーしているので、そこも普通の React コード。

**読みにくい点・手で直すとしたらどこか**

- **式の重複**: 式をそのまま埋め込むので、同じ計算が何度も出てくる。D2 では `data.alarms.find((a) => a.id === params.alarmId)` が 5 回、S1 のメトリクスカードは「機器ごとの最新メトリクス」の計算が 3 回。手で書くなら `const alarm = …` や派生値のセレクタに切り出す。→ スキーマに派生値（computed）を持てると解消できる（#5 のフィードバックと同じ）。
- **`setState` の文字列パス**: `setState("draftSettings.network.ip", event.value)` は型が効かない。手で書くなら `updateDraft((draft) => { draft.network.ip = value })` のような型付きの関数にする。
- **`strictNullChecks: false`**: 式が null を考慮していないため。手で直すなら式に `?.` を足すか、ダイアログの params で下書きを渡す。
- ストアから `data` を丸ごと読むので、どのコレクションが変わっても再描画する（題材の規模では問題ない）。
- `sampleData.ts` が 1135 行ある（サンプルデータをそのまま TS で出力）。手で直すなら JSON に分けるか、API から取る。
- `const props = { unit: "", ...input };`（default のある props）はやや見慣れない形。
- 題材ファイルが `serializeProject` で正規化されているため、props の定義などのキーが `value` を先頭にアルファベット順になり、生成コードの属性の並びも入力と違う（MetricCard が `value, label, unit` の順）。

### パーツを 1 種類追加する手間

組み込みの type を 1 つ足すには、`templates/ui/<Name>.tsx` に部品を書き、`src/emit/tree.ts` の `UI_COMPONENTS` に 1 行足す。props をそのまま属性にするだけなら生成器の変更はこれだけ。Text / Button / Table のように props を子や関数に変えるものは `tree.ts` の `switch` に数行足す。イベントは `on` + イベント名の属性になるので、部品側で `onXxx({ value })` を呼べばよい。

コンポーネント（ユーザーが作る部品）は生成器の変更なしで増やせる。

### 実装量と依存ライブラリ

| 対象                              | 量                                                               |
| --------------------------------- | ---------------------------------------------------------------- |
| 生成器（`src/`、テストを除く）    | 約 1,700 行（うちバインディング 250、JSX 230、ファイル単位 215） |
| 組み込みの部品（`templates/ui/`） | 約 360 行（CSS 含む）                                            |
| テスト                            | 約 190 行（34 件）                                               |
| 生成器の依存                      | `@ui-editor/schema`、`prettier`（整形）、`acorn`（式の検証）     |
| 生成したアプリ（題材）            | 39 ファイル、`src/` 約 2,300 行（うち sampleData 1,135 行）      |
| 生成したアプリの依存              | react / react-dom / react-router / zustand、開発用に vite / TS   |
| 生成にかかる時間                  | 約 70 ms（題材、Prettier 込み）                                  |

### プロジェクトファイル（P0 形式）で表現しきれたか・スキーマの不足

題材は全部生成できた。生成してみて分かった不足（#2 に報告）:

1. **コレクションとデータモデルの型の対応が無い**。`sampleData.devices` が `Device[]` であることが書かれていないので、名前から推測している（`devices` → `Device`、`deviceSettings` → `DeviceSettings`）。
2. **式が null を考慮していない**ことをスキーマ側で検出できない（D1 の `state.draftSettings.network`）。生成コードの型チェックで初めて分かる。エディタ側で TS の型チェックをかけられると早く気づける。
3. **派生値が無い**ため、同じ式を何度も書くことになり生成コードにも重複が出る。
4. **`serializeProject` がレコードのキー（props の定義・style など）も並び替える**。ユーザーが決めた順（props の宣言順）が失われ、生成コードの並びにも影響する。
5. 組み込みの props（`variant` など）がスキーマで縛られていないので、誤りは生成したアプリの型チェックで見つかる（生成時ではない）。
6. 画面の params の `type` は URL から来るので実質 `string` だけ。`number` などは生成コードで変換している。
7. コンポーネントのインスタンスに `style` を付けた場合の扱い（コンポーネントが `className` を受け取るか）が決まっていない。生成器も未対応（題材では使っていない）。

### 本格開発にそのまま持っていけそうな点・持っていけない点

**持っていけそう**

- 「プロジェクトファイル → 検証 → 純粋関数で生成 → Prettier」の構成と、スナップショットで生成コードを丸ごと見る運用。生成器の変更が生成コードの diff として見えるのでレビューしやすい。
- 式をそのまま埋め込み、acorn でスコープを検証する方式。変換の実装が小さく、生成コードも読みやすい。
- 組み込みの部品を手書きの `src/ui/` として持つ方式（デザインシステムに差し替えやすい）。
- 生成コードの構成（ディレクトリ・命名・react-router・ストアでのダイアログ管理）。

**持っていけない・作り直しが要る**

- 文字列テンプレートで TSX を組み立てている（読みやすいが、生成するものが増えると崩れやすい）。本格的には TS の AST（ts-morph など）か、小さな JSX ビルダーにしたい。
- 型チェックが生成後にしか走らない。エディタで式を書いた時点で型チェックできる仕組み（P4 と共通化）が要る。
- `setState` の文字列パス、`strictNullChecks: false`、`sampleData` の埋め込みは生成コードの仕様として見直しが要る。
- 生成後に手で直したコードを再生成で上書きしない運用（#1 の想定どおり「開発フェーズでは再生成しない」）なら、上記の手直しは生成後に人がやる前提でもよい。

## テスト

| テスト           | 内容                                                                              |
| ---------------- | --------------------------------------------------------------------------------- |
| 決定性           | 同じ入力で 2 回生成し、全ファイルが一致する                                       |
| スナップショット | 生成結果が `snapshots/<題材>/` のファイルと一致する。余分なファイルがあっても失敗 |
| バインディング   | テンプレート → 式の変換、スコープの検証（`src/emit/binding.test.ts`）             |
| 生成時エラー     | 変換できない式で生成が失敗し、場所が分かる（`src/generate-errors.test.ts`）       |

`snapshots/` は生成したアプリそのもの（`node_modules` なし）なので、生成コードを読むときのサンプルも兼ねる。生成器を変えたら更新して diff を確認する。

```sh
pnpm --filter @ui-editor/codegen snapshots:update
```

題材は `src/examples.ts` の `EXAMPLES`（`fixtures/hello.project.yaml` と、schema の `device-monitor.project.yaml`）。

### 生成したアプリのビルド確認

ネットワークからのインストールが要るので `pnpm test` には含めない。題材ごとに `out/<題材>/` へ生成し、リポジトリの workspace とは別にインストールしてビルドする（`out/` は git 管理外）。

```sh
pnpm --filter @ui-editor/codegen build:examples            # 全題材
pnpm --filter @ui-editor/codegen build:examples hello      # 1 つだけ
```
