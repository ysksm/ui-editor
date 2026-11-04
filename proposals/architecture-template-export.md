# 提案書: 書き出しを architecture-template の形にする

- 作成日: 2026-11-04
- 更新日: 2026-11-04（汎用化の観点のレビューと、オーナーの回答を反映した。内容は 11 章）
- 状態: 提案（オーナーは「先に ui-editor を変更して、MyLifeOS を進める」と決めた）
- 読む人: この提案を実装する Claude Code
- 調査の基準:
  - `ui-editor` のコミット `f7e197d`
  - `architecture-template` の `main` のコミット `dd9c440`（[PR #26](https://github.com/ysksm/architecture-template/pull/26) のマージ。`vendor` の基準はこのコミットとする）

## 0. 実装する人へ

この提案書の中のパスは、特に書いていなければ `original-poc/` からの相対パスである（例: `packages/codegen` は `original-poc/packages/codegen`）。

1. 先に次を読む。
   - この提案書の全部
   - [architecture.md](../original-poc/docs/architecture.md) の 3 章・4.12・8 章
   - `../../architecture-template/docs/ARCHITECTURE.md`
2. **決めていることは 4 章にある。** 4 章の既定で進め、作業のたびに聞き返さない。4 章で決められないことが出たら、作業の PR に書いて止まる。
3. 作業は 6 章の順に行う。**1 issue = 1 コミット = 1 PR。** ブランチは `ysksm/op8-1` の形にする（[architecture.md](../original-poc/docs/architecture.md) 8 章と同じ）。
4. **今の書き出し（`vite-zustand`）を壊さない。** 既存のテストとスナップショットは、OP8-1 以降も変わらないこと。
5. **書き出しは `architecture-template` に合わせる。** どのアプリでも要るものは、先に `architecture-template` へ PR を出し、マージしたコミットを `vendor` に取り込む。`overlay` はマージを待つ間だけ使う（3.2）。
6. **特定のアプリの名前と業務を `packages/codegen` に入れない。** 1.1 の決まりに従う。

## 1. 結論

**できる。** 書き出しの先を「ターゲット」として切り替えられるようにし、新しいターゲット `architecture-template` を足す。

ER・式・アクションの定義はそのまま使える。変えるのは次の 4 か所で、作業の中心は 2 つめである。

| 変える所       | 内容                                                                    |
| -------------- | ----------------------------------------------------------------------- |
| データの持ち方 | 同期の Zustand ストア → 非同期の Repository・ユースケース・`Result`     |
| 生成物の形     | 画面中心の構成 → DDD の 5 層と、`api-idl`・`test/` を含むリポジトリ全体 |
| 再生成         | 全部上書き → 手で書いた業務ルールを残せる形                             |
| 拡張点         | 無い → アプリ固有の処理と部品を、生成物を直さずに足せる形               |

**なぜ必要か:** 「ER と画面を `ui-editor` で作り、`architecture-template` の形で実装する」進め方を、どのアプリでも使えるようにする。今の書き出しの形は `architecture-template` と違うので、書き出したものが本番の土台にならない。最初の利用者は MyLifeOS である。

### 1.1 汎用にするための決まり

要求は次の 3 段に分けて置く。下の段のものを上の段に入れない。

| 段              | 置き場                              | 例                                                                  | 入れてはいけないもの     |
| --------------- | ----------------------------------- | ------------------------------------------------------------------- | ------------------------ |
| 1. テンプレート | `vendor`（`architecture-template`） | 5 層、`Result`、`lib/datastore`、ルーター、ダイアログ、部分読み込み | 題材の TODO              |
| 2. ターゲット   | `targets/` の生成処理               | ER からの生成、再生成                                               | アプリの名前・業務ルール |
| 3. アプリ       | 書き出した先の「ひな形」と拡張点    | 「休みの日は続いた日数を途切れさせない」                            | —                        |

新しい要求は次の順に判断する。

1. どのアプリでも要るか。要るなら、まず 1 段目（テンプレートへの PR）に足せないかを考える。ER に依存するものは 2 段目に足す。
2. アプリ固有なら、3 段目（D16 の拡張点）で書けるか。書けるなら、ここで書く。
3. 書けないなら、足りないのは拡張点である。アプリ固有の分岐ではなく、拡張点を足す。

**「あるアプリのため」を理由に、生成の分岐やオプションを足さない。**

## 2. 今の書き出しとテンプレートの違い

| 項目             | 今の書き出し                   | architecture-template                                 | 対応         |
| ---------------- | ------------------------------ | ----------------------------------------------------- | ------------ |
| データの置き場   | Zustand（メモリ）              | `lib/datastore` の Collection                         | OP8-4        |
| データの変更     | 同期関数（`store/records.ts`） | ユースケース → Repository。`Promise<Result>`          | OP8-3・OP8-5 |
| エンティティ     | 型と素の値                     | private コンストラクターの Entity と Value Object     | OP8-2        |
| 検証             | 実行時に `schema.ts` を見る    | Value Object の `create()`                            | OP8-2・OP8-5 |
| 組み立て         | なし                           | Composition Root。環境変数で Mock / Http を切り替える | OP8-3        |
| 通信の定義       | なし                           | TypeSpec → OpenAPI → 型                               | OP8-3        |
| 画面             | 1 ファイルに描画と処理         | コンポーネントと Controller Hook（ViewModel）         | OP8-4        |
| 画面遷移         | react-router                   | react-router（`presentation/AppRoutes.tsx`）          | D5           |
| ダイアログ       | ストアの中の配列               | `lib/dialog` の `DialogStack`                         | D6           |
| データの読み方   | 全件をメモリに持つ             | `findAll`・`findPage`・`findById` を選ぶ              | D2           |
| 主キー           | `dev-001`（接頭辞 + 連番）     | UUID                                                  | D3           |
| コードの書き方   | prettier（セミコロンあり）     | セミコロンなし・シングルクォート・oxlint              | OP8-1        |
| パッケージ管理   | pnpm 前提の案内                | サブプロジェクトごとに npm                            | OP8-1        |
| テスト           | なし                           | Vitest・`bun test`・Playwright                        | OP8-2 以降   |
| 再生成           | 全部上書き                     | —（手で書く前提）                                     | OP8-7        |
| アプリ固有の処理 | 生成物を直す                   | ユースケース・Entity のメソッドを手で書く             | OP8-8        |

## 3. 全体の設計

### 3.1 ターゲット

```ts
export interface Target {
  id: string; // "vite-zustand" | "architecture-template"
  label: string; // エディタの選択肢に出す
  reservedEntityIds: readonly string[];
  capabilities: { customAction: boolean; customNode: boolean };
  /** ターゲット固有の制約を調べる（D20）。問題があれば `GenerateError` で止める。 */
  check(project: Project): Issue[];
  emit(project: Project, options: { appName: string }): Promise<GeneratedFile[]>;
}

export interface GenerateOptions {
  appName?: string;
  target?: string; // 既定 "vite-zustand"
}
```

`Target` は表で登録する。ターゲットを足すときに `generate()` の分岐を増やさない。プロジェクトが使う機能にターゲットが対応していなければ、`GenerateError` で止める。

`generate()` は `checkProject` と名前の確認のあと、ターゲットごとの処理に渡す。ファイルを読み書きしない純粋な関数のままにする（エディタがブラウザの中で呼ぶため）。ターゲットの処理と埋め込みは `import()` で読み、使わない人のエディタを重くしない。

```ts
export interface GeneratedFile {
  path: string;
  content: string;
  kind: "generated" | "scaffold"; // 既定 "generated"（6.1）
}
```

書き出す先と突き合わせる処理も、純粋な関数にする。読み書きは CLI・MCP・エディタがそれぞれ行う。

```ts
planExport(files, existing: { manifest?: Manifest; hashes: Record<string, string> }): ExportPlan;
```

`packages/codegen/src` の新しい構成:

```text
src/
├── generate.ts                 共通の入口（検証 → ターゲットへ）
├── names.ts / files.ts / format.ts / node.ts   共通
├── emit/                       今のまま（vite-zustand）。共通に使える部分は shared/ へ移す
└── targets/
    └── architecture-template/
        ├── index.ts            ターゲットの入口（Target の定義）
        ├── domain.ts           Entity・Value Object・Repository
        ├── application.ts      ユースケース
        ├── infrastructure.ts   Dto・Mapper・Http / Mock Repository
        ├── composition.ts      createApplication
        ├── idl.ts              TypeSpec
        ├── presentation.ts     View・Controller Hook・画面・ダイアログ
        ├── backend.ts          test/backend
        └── sql.ts              db/schema.sql
```

### 3.2 テンプレートの取り込み

置き場を 2 つに分ける。

| 置き場                                                    | 中身                                           | 決まり                       |
| --------------------------------------------------------- | ---------------------------------------------- | ---------------------------- |
| `packages/codegen/targets/architecture-template/vendor/`  | コミット `dd9c440` の固定のファイル            | 手で直さない。取り込み直せる |
| `packages/codegen/targets/architecture-template/overlay/` | テンプレートへの PR がマージされるまでの一時物 | 既定で空。マージしたら消す   |

- `VENDOR.md` に元のコミットと、書き換えの一覧を書く。
- `overlay` に置いたものは、`overlay/UPSTREAM.md` に対応する PR を書く。
- 取り込むときは `git archive` などで**コミットから**取り出す。テンプレートの作業フォルダには未コミットの変更がある（`test/e2e` の下）。
- 今の `scripts/embed-templates.mjs` を広げて、文字列の定数として埋め込む（ブラウザで動かすため）。
- `package-lock.json` は書き出さない。`package.json` の `name` を書き換えるので合わなくなるため。ロックファイルは、書き出した先で最初の `npm install` のあとにコミットする。

取り込まないもの:

- `web-frontend-preact/`
- `docs/`
- `domain/todo`・`application/todo`・`infrastructure/todo`・`presentation/todo`・`presentation/AppRoutes.tsx`
- `composition/createTodoApplication.ts`
- `test/backend/src` の TODO のファイル（`api/contract.ts`・`app.ts`・`app.test.ts`・`todoStore.ts`・`todoValidation.ts`・`generated/`）
- `test/e2e/tests/todo.spec.ts`・`todoApi.ts`
- `package-lock.json`
- `screenshots`・`dist`・`node_modules`
- `tsp-output`

`vendor` から書き換えて出すもの:

- `App.tsx`・`App.css`・`main.tsx`・`index.html`・`package.json` の `name`
- `api-idl/scripts/generate-types.mjs`（`TARGETS` から preact を外す。`todo-api` → `api`。配置先は D17）
- `api-idl/tspconfig.yaml`（`output-file`）
- `.env.example`（`VITE_TODO_REPOSITORY` → `VITE_REPOSITORY`）
- `test/e2e/playwright.config.ts`（`VITE_TODO_REPOSITORY`・`TODO_SEED`・`E2E_FRONTEND_DIR`）
- `test/e2e/package.json`（`test:preact`・`test:all` を外す）と `E2E_FRONTEND_DIR` の分岐
- `test/backend/src/server.ts`（`TODO_SEED`）
- `infrastructure/shared/toRepositoryResult.ts`・`infrastructure/storage/createBrowserStorage.ts`・`lib/datastore/Collection.ts` の文言とコメント

**確認:** 書き出したものの全ファイルに `todo` が残っていないことをテストする（大文字・小文字を区別しない）。

### 3.3 書き出すもの

```text
<out>/
├── README.md                   動かし方（生成）
├── .ui-editor/manifest.json    再生成の記録（OP8-7）
├── web-frontend/src/
│   ├── domain/
│   │   ├── shared/（`Result`・`Page` など）       固定
│   │   └── <entity>/
│   │       ├── entities/DeviceBase.ts             生成（D15）
│   │       ├── entities/Device.ts                 ひな形（D15）
│   │       ├── repositories/DeviceRepository.ts   生成（ルートのエンティティだけ）
│   │       └── value-objects/…                    生成
│   ├── application/<entity>/                      生成（CRUD）
│   ├── application/custom/                        ひな形（D16）
│   ├── infrastructure/
│   │   ├── shared/・storage/                      固定
│   │   ├── generated/api.d.ts                     外部生成（D17）
│   │   └── <entity>/                              生成
│   ├── presentation/
│   │   ├── AppRoutes.tsx                          生成
│   │   ├── shared/（useAsync・usePagedList・DialogHost）固定
│   │   ├── shared/useInitialData.ts               生成（D2）
│   │   ├── ui/                                    今の部品を移す
│   │   ├── views/<entity>View.ts                  生成（D4）
│   │   ├── screens/<Name>Screen.tsx               生成
│   │   ├── screens/use<Name>Screen.generated.ts   生成（D15）
│   │   ├── screens/use<Name>Screen.ts             ひな形（D15）
│   │   ├── custom/                                ひな形（D16）
│   │   └── dialogs/                               生成
│   ├── composition/createApplication.ts           生成
│   ├── composition/extendApplication.ts           ひな形（D16）
│   ├── lib/（datastore・dialog）                  固定
│   └── main.tsx・App.tsx                          生成
├── api-idl/main.tsp            生成
├── db/schema.sql               生成
└── test/
    ├── backend/                生成（インメモリ。src/generated/api.d.ts は外部生成）
    └── e2e/                    固定 + 生成
```

### 3.4 ER から Domain への対応

| フィールドの型                   | Domain                                     | TypeSpec                              | SQLite                                            |
| -------------------------------- | ------------------------------------------ | ------------------------------------- | ------------------------------------------------- |
| `id`                             | `value-objects/ids/DeviceId.ts`（D3）      | `string`                              | `TEXT PRIMARY KEY`                                |
| `string`                         | Value Object。`required`・`format` を検証  | `string`                              | `TEXT`                                            |
| `string` + `format` `email` など | 同上。形式も検証                           | `string`（`@format`）                 | `TEXT`                                            |
| `number`                         | Value Object。`min`・`max` を検証          | `numeric`（`@minValue`・`@maxValue`） | `REAL`                                            |
| `boolean`                        | `boolean` のまま（D8）                     | `boolean`                             | `INTEGER` + `CHECK`                               |
| `date`（`date`）                 | Value Object                               | `plainDate`                           | `TEXT`                                            |
| `date`（`datetime`）             | Value Object                               | `utcDateTime`                         | `TEXT`                                            |
| `date`（`time`。OP9-1）          | Value Object（`HH:mm`）                    | `plainTime`                           | `TEXT`                                            |
| `enum`                           | Value Object。`values` の union            | `enum`                                | `TEXT` + `CHECK`                                  |
| `ref`                            | 参照先の Id                                | `string`                              | `TEXT REFERENCES`（`onDelete` に従う）            |
| `children`                       | 子の Entity（配列か 1 件）。集約の中に持つ | 入れ子のモデル                        | 子のテーブルに親の外部キー（`ON DELETE CASCADE`） |

`required` でない項目は `null` を許す（`T | null`）。`unique` の扱いは D19。

テンプレートの `tsconfig` は `erasableSyntaxOnly`・`noUnusedLocals`・`noUnusedParameters` を有効にしている。生成コードでは TS の `enum` と constructor の引数プロパティを使わず、使わない import を出さない。列挙は文字列の union にする。

### 3.5 アクションの対応

| アクション                                           | 新しいターゲットでの動き                                                                                                     |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `navigate`・`back`・`setState`・`select`・`setDraft` | 今と同じ（同期）。置き場は `lib/datastore` の `State`（D6）                                                                  |
| `openDialog`・`closeDialog`                          | 今と同じ意味。`onClose` も同じ                                                                                               |
| `createRecord`                                       | Value Object を作る → ユースケース → 成功なら Collection に `put`                                                            |
| `updateRecord`                                       | 主キーで探して更新。`match` が主キーでなければ D7                                                                            |
| `deleteRecord`                                       | 削除のユースケース。`onDelete` の扱いは D9                                                                                   |
| `openDialog` の結果                                  | `dialogs.open()` を `await` する。`closeDialog` の値が `onClose` に渡る                                                      |
| `custom`（OP8-8）                                    | `application/custom/<name>` を呼ぶ。`Err` の扱いはほかのユースケースと同じ（D16）                                            |
| `saveDraft`                                          | 下書きを項目ごとに Value Object にする。`DomainValidationError` を項目ごとの `errors` に入れて止める。作成か更新かは今と同じ |

- 処理の関数は `async` にする。アクションは順に `await` し、`Err` なら後続を止めて `notify` で知らせる。今の「失敗すると止まる」と同じ意味にする。
- `when` は今と同じ。
- 入れ子の子の変更は、ルートを読み、子を変えて、ルートごと `update` する（D1）。
- 処理中は、押した部品を無効にする（テンプレートの `pendingIds` と同じ考え）。
- `paged` のエンティティを作成・更新・削除したら、開いている一覧を `usePagedList` の `reload()` で読み直す。

## 4. 決めたこと（既定）

| #   | 論点                       | 既定                                                                                                                                                                                                                                                                                                                                                                                                                                             | 理由                                                                                                                                                                                                     |
| --- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | 集約                       | **ルートのエンティティ 1 つが 1 集約。** Repository はルートだけに作る。子は親と一緒に読み書きする                                                                                                                                                                                                                                                                                                                                               | 入れ子が正という poc-0 の考えと合う。親を消せば子も消える                                                                                                                                                |
| D2  | データの読み込み           | **エンティティごとに読み方を選ぶ。** poc-0 の `Entity` に `loading?: "all" \| "paged"`（既定 `all`）を足す。任意の項目なのでスキーマの版は上げず、`vite-zustand` は無視する。`all`: 起動時に `findAll` で全件を Collection に入れる（`presentation/shared/useInitialData.ts`）。`paged`: 起動時には読まず、一覧の画面は `usePagedList` と `findPage`、1 件の画面は `findById` で読む。読み込みの処理は `use<Name>Screen.generated.ts` に生成する | 件数の少ないマスタは今の式をそのまま使え、件数の多いデータは画面ごとに読める。テンプレートの「データの読み方」と同じ分け方にする。`paged` では **「`data.X` は全件」という前提を捨てる**（D20）          |
| D3  | 主キー                     | **空でない文字列の Value Object。** UUID に限らない。新規は `crypto.randomUUID()`                                                                                                                                                                                                                                                                                                                                                                | サンプルデータの `dev-001` を読めるようにする                                                                                                                                                            |
| D4  | 式の評価先                 | **Presentation に素のオブジェクト（View）を置く。** `toDeviceView(device)` で Entity から作る                                                                                                                                                                                                                                                                                                                                                    | Entity は `name()` のような形なので、式 `row.name` がそのままでは動かない。View を挟めば式を書き換えずに済む                                                                                             |
| D5  | 画面遷移                   | **テンプレートの `react-router` を使う。** `presentation/AppRoutes.tsx` を、テンプレートと同じ形で生成する                                                                                                                                                                                                                                                                                                                                       | PR #26 でテンプレートに入れた。URL・再読み込み・戻るが要る                                                                                                                                               |
| D6  | UI の状態                  | ダイアログは **`lib/dialog` の `DialogStack`**。`state`・選択・お知らせは `lib/datastore` の `State`。Zustand は使わない                                                                                                                                                                                                                                                                                                                         | テンプレートの状態の持ち方に合わせる                                                                                                                                                                     |
| D7  | 主キーでない `match`       | `all` のエンティティは、ユースケースが一覧を読み、Application の中で絞る。`paged` のエンティティは `GenerateError` にして、`custom` で書くように案内する                                                                                                                                                                                                                                                                                         | 読み込んだ分だけで絞ると対象が欠ける。任意の項目の検索を Repository に生成しない                                                                                                                         |
| D8  | `boolean`                  | Value Object にしない                                                                                                                                                                                                                                                                                                                                                                                                                            | 値の制約が無く、ファイルが増えるだけ                                                                                                                                                                     |
| D9  | `ref` の `onDelete`        | **守る責任はデータの持ち主にある。** Domain に `ReferencePolicy` のインターフェースを置き、削除のユースケースから呼ぶ。Mock は保存先（`Collection` ではない）を読み、関係するルートを更新・削除する。Http では何もせず、サーバーが 1 トランザクションで行う（`restrict` なら 409）。成功したら関係するエンティティを読み直す。`paged` なら開いている一覧を先頭から読み直す                                                                       | 複数の集約の変更をクライアントから順に行うと、途中の失敗で参照が壊れる。`paged` の Collection は全件ではないので、参照の判定に使えない。`test/backend` も同じ規則を実装し、Mock と Http の動きをそろえる |
| D10 | REST                       | `GET/POST /devices`、`GET /devices/page?limit&cursor&<項目>`、`GET/PUT/DELETE /devices/{id}`。パスは `pluralize` のあとの kebab-case（`DailyRecord` → `/daily-records`）。応答は子を入れ子で含む。子だけのパスは作らない。`limit` は 1〜100、既定 20。`page` は主キーに使えない。参照が残って消せないとき、一意の値がぶつかったときは 409                                                                                                        | D1 と同じ。テンプレートの `/todos/page`・`/todos/{id}` と同じ形にする                                                                                                                                    |
| D11 | 既定の Repository          | `VITE_REPOSITORY` が無ければ Mock（localStorage）。サンプルデータを初期値にする。保存のキーは `<アプリ名>.<エンティティ>.<ER のハッシュ>`                                                                                                                                                                                                                                                                                                        | D17 の生成のあとは、バックエンド無しで動く。ER を変えて再生成しても、古い形のデータで起動に失敗しない（Mock のデータは初期値に戻る）                                                                     |
| D12 | Go のサーバー              | **生成しない。** `api-idl` の OpenAPI と `db/schema.sql` を出すところまで                                                                                                                                                                                                                                                                                                                                                                        | テンプレートに本番のバックエンドが無い。形を決めずに生成しない                                                                                                                                           |
| D13 | Preact 版                  | 対象にしない                                                                                                                                                                                                                                                                                                                                                                                                                                     | テンプレートの本流は React 版である。要るなら別のターゲットとして足す                                                                                                                                    |
| D14 | 版                         | 依存の版は `vendor` の `package.json` のものを使う。`overlay` で足す依存は `overlay` で固定する                                                                                                                                                                                                                                                                                                                                                  | テンプレートと同じ環境にする                                                                                                                                                                             |
| D15 | 手で書く所の分け方         | **1 つのファイルは「全部生成」か「全部手書き」のどちらか。** `Device.ts`（ひな形）は `DeviceBase.ts`（生成）を継承する。`use<Name>Screen.ts`（ひな形）は既定で `use<Name>Screen.generated.ts` をそのまま返す                                                                                                                                                                                                                                     | ER や画面を変えたとき、項目と処理は生成の側に自動で入り、手書きは残る。`Device` の private コンストラクターは保ち、`DeviceBase` だけ protected にする                                                    |
| D16 | 拡張点                     | **`custom` アクションと `Custom` 部品を poc-0 に足す。** 中身は書き出した先の `application/custom/`・`presentation/custom/` に手で書く。登録は `composition/extendApplication.ts`。プレビューでは、アクションはログだけ、部品は枠だけを出す                                                                                                                                                                                                      | 今は組み込み以外のアクションと部品を書けず、固有の要求を入れるには生成物を直すしかない。任意の項目の追加なので、スキーマの版は上げない。対応しないターゲットは `GenerateError`                           |
| D17 | 型の生成                   | `openapi-typescript` の型は `generate()` では作らず、書き出した先で `api-idl` の `npm run generate` で作る。配置先は `web-frontend/src/infrastructure/generated/api.d.ts` と `test/backend/src/generated/api.d.ts`。manifest には入れない                                                                                                                                                                                                        | Node のツールなのでブラウザで動かない。テンプレートの作り方と同じで、`npm run check` も通る                                                                                                              |
| D18 | フォルダの消去             | CLI の `--clean` は、`architecture-template` のターゲットでは使えない（エラーにする）                                                                                                                                                                                                                                                                                                                                                            | 今の `--clean` は `node_modules` とロックファイル以外を消すので、手で書いたコードが消える                                                                                                                |
| D19 | `unique`（実装済み。#158） | 1 項目の一意。Value Object では確かめられないので、データの持ち主が守る。Mock は Repository の `create`・`update` で確かめて `Err`。Http はサーバーが 409 を返す。`test/backend` も同じ。SQL は `UNIQUE`。TypeSpec は `@doc` に書き、`create`・`update` は 409 の `Error` に `field` を入れて返す。`saveDraft` は `RepositoryError.field` を項目ごとの `errors` に入れる。空の値は数えない                                                       | クライアントは全件を持つとは限らないので、画面やユースケースでの重複の確認は当てにならない                                                                                                               |
| D20 | `paged` の式               | `Target.check` で調べる。`paged` のエンティティの `data.X` に、`.length`・`.filter`・`.find`・`.some`・`.reduce` など全件を前提にする式を書いたら `GenerateError`。`Table` などの `data` に直接置くだけなら通す。`paged` のエンティティを選択肢にする `Select` も止める。絞り込み・集計は `custom` か `use<Name>Screen.ts` で、生成した `<Entity>Query`（`PageRequest` と `enum`・`ref` の項目）を使って書く                                     | 動くが結果が欠けるコードを生成しない。検索の UI を一般化せず、固有の要求として拡張点で書く                                                                                                               |

## 5. 今回やらないこと

- Go のサーバーと MCP サーバーの生成
- ログイン
- 多対多
- `paged` の並べ替え・全文検索の生成（`custom` で書く）
- `unique` の組み合わせ（複数の項目で一意）
- 楽観的更新、オフライン
- Tauri
- `web-frontend-preact` の生成
- アプリ固有の業務ルールの生成（1.1）
- 拡張点の中身をエディタで書くこと（名前を指定するだけ）

## 6. 作業計画

親 issue を 1 つ作り、下の 1 行を 1 issue にする。OP8-0（`unique`。#158）と、テンプレートへの追加（PR #26）は完了した。OP8 は書き出し、OP9 はエディタの改善である。OP9 は MyLifeOS で必要になったものだが、どのアプリでも使える形で作る。

### OP8: 書き出しのターゲット

| 順     | 作業                                                                                                                                                                                                                                                     | 完了条件                                                                                                                                                                                                  |
| ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| OP8-0  | **`unique`（完了。#158）。** スキーマ・検証・`datastore`・runtime・seed・エディタ                                                                                                                                                                        | 完了                                                                                                                                                                                                      |
| OP8-0b | **`Entity.loading`。** スキーマ・検証・ER パネル・MCP・`architecture.md`。生成は変えない                                                                                                                                                                 | 既存のスナップショットが変わらない。OP8-4 より先に行う                                                                                                                                                    |
| OP8-1  | **ターゲットの導入と土台。** `Target` の表（`check` を含む）と `GeneratedFile.kind` を足す。テンプレートを `vendor` に入れて埋め込む。`format.ts` にターゲットごとの整形（セミコロンなし・シングルクォート）を足す。エンティティ無しで土台だけを書き出す | 既存のスナップショットが変わらない。書き出したものに `todo` が残らない。`api-idl` の生成のあと、`web-frontend` で `npm run lint`・`npm test`・`npm run build` が通る                                      |
| OP8-2  | **Domain。** 3.4 の Value Object・`DeviceBase`・`Device`（D15）・Repository のインターフェース。`create` と `reconstitute`。Value Object と Entity のテストも生成する                                                                                    | 題材で `tsc` が通る。範囲外・空・不正な形式で `DomainValidationError` になることを生成したテストで確かめる                                                                                                |
| OP8-3  | **契約と裏側。** `main.tsp`、Dto・Mapper、Http / Mock Repository（`findAll`・`findPage`・`findById`）、CRUD のユースケース、`ReferencePolicy`、`createApplication`。D1・D7・D9・D10・D11・D17・D19                                                       | `api-idl` で `npm run generate`・`npm run check` が通る。Mapper の往復、入れ子の子、`onDelete`、ページ、`unique` のテストが通る                                                                           |
| OP8-4  | **画面の読み取り。** View（D4）、`State` と `DialogStack`（D6）、読み込み（D2・D20）、`AppRoutes`（D5）、部品の移動、画面と Controller Hook の分離（D15 の 2 ファイル）。ボタンは次の作業まで動かなくてよい                                              | 題材の全画面が表示される。読み込み中とエラーが出る。`paged` の一覧で続きを読め、詳細を URL から直接開ける。全件を前提にする式が `GenerateError` になる。**コンポーネントが `application` を直接触らない** |
| OP8-5  | **画面の変更。** 3.5 のアクション、`saveDraft` の項目ごとのエラー、処理中の無効化                                                                                                                                                                        | 題材の作成・更新・削除・カスケード・検証エラーが画面で動く                                                                                                                                                |
| OP8-6  | **バックエンドと E2E。** `test/backend` の生成（D9 の `onDelete` を含む）、`generate-types.mjs` の配置先、題材の Playwright テスト。`app/qa/step6.mjs` の筋書きを新しいターゲットで動かす                                                                | 7 章の確認がすべて通る。Mock と Http の両方で同じ筋書きが通る。**主キーの値は比べない**（D3）                                                                                                             |
| OP8-7  | **再生成。** 6.1 のとおり。`planExport`・manifest・D18                                                                                                                                                                                                   | 手で直したファイルが消えない。7 章のテストが通る                                                                                                                                                          |
| OP8-8  | **拡張点。** D16 のスキーマ・検証・プレビュー・エディタ・MCP・生成                                                                                                                                                                                       | `custom` のアクションと `Custom` の部品を置いて再生成しても、手で書いた中身が残り、画面から動く                                                                                                           |
| OP8-9  | **SQL。** `db/schema.sql`。親より先に子を作らない順で、決定的に並べる。`unique` は `UNIQUE` にする                                                                                                                                                       | SQLite に読み込める。入れ子と `ref` の削除が `onDelete` のとおりに動く                                                                                                                                    |
| OP8-10 | **入口。** CLI の `--target`、MCP `export_code` の `target`、エディタの書き出しの選択、文書の更新                                                                                                                                                        | 3 つの入口で同じバイト列が出る                                                                                                                                                                            |

### OP8 で必ず足すテスト

**層のテスト:** 生成物の import を読み、ARCHITECTURE.md の依存方向に反するものが無いことを確かめる。

- `domain` は他の層と React を import しない
- `application` は `domain` だけ
- `infrastructure` は `domain` だけ
- `presentation` は `infrastructure` の具象を import しない
- 具象 Repository を `new` するのは `composition` だけ

**決定性のテスト:** 同じ入力で 2 回生成すると同じ出力になる。日時・乱数・絶対パスを出さない。

**スナップショット:** 題材の生成物を `packages/codegen/snapshots/` に足す。

**汎用性のテスト:** 生成物、`targets/`、`overlay/` に `todo` と `mylifeos` が無いことを確かめる（`vendor/` の取り込まないものは除く）。入れ子が中心の題材と、入れ子が無く時刻を使う題材の 2 つで、7 章の確認を通す。

### 6.1 再生成（OP8-7）

ER から作れない業務ルール（例: 「休みの日は続いた日数を途切れさせない」）は、アプリごとにある。全部上書きでは、手で書いた所が消える。

ファイルを 2 種類に分ける（D15）。1 つのファイルの中に、生成と手書きを混ぜない。

| 種類       | 例                                                                                                                                 | 再生成のとき                               |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| **生成**   | `DeviceBase`、Value Object、CRUD のユースケース、Dto、Mapper、`main.tsp`、`schema.sql`、View、画面、`use<Name>Screen.generated.ts` | 上書きする。ただし手で直されていたら止める |
| **ひな形** | `Device.ts`、`use<Name>Screen.ts`、`extendApplication.ts`、`application/custom/`、`presentation/custom/`                           | 無いときだけ作る。あるときは触らない       |

- D17 の型は、どちらにも入れない。書き出す処理は触らない。
- 書き出すたびに `.ui-editor/manifest.json` に、ターゲット・テンプレートのコミット・スキーマの版と、ファイルごとの種類・生成した中身のハッシュを書く。日時は書かない。
- 「生成」のファイルが、前回のハッシュと違っていれば手で直されたものとみなす。その一覧を返して**書き出さない**。`force` のときだけ上書きする。`force` でも「ひな形」は上書きしない。
- manifest のターゲットと違うターゲットで書き出そうとしたら止める。
- manifest が無い、空でないフォルダには書き出さない。
- ER で消したエンティティ、フローで消した画面のファイルは自動で消さず、一覧で知らせる。消した相手を参照する「ひな形」は `tsc` で見つかる。
- ファイルの先頭に、種類が分かる注釈を書く。
- エディタ: フォルダを選べるときは、中の manifest とファイルを読んで `planExport` に渡す。zip のときは書き出す先を読めないので、全ファイルを出し、その旨を画面に出す。

### OP9: エディタの改善

OP8 が終わってから行う。OP9-1 だけは ER の設計に要るので、先に行ってよい。先に行うときは `vite-zustand` で完了とし、`architecture-template` の分は 3.4 の表に従って OP8-2 と OP8-5 で作る。

| 順    | 作業                                                                                                                                                                           | 完了条件                                                              |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------- |
| OP9-1 | **時刻の項目と「いま」。** `date` 型に `format: "time"`（`HH:mm`）を足す。式で使える `now()`・`today()` を足す。どちらも端末の時刻帯で、プレビューと生成コードで同じ意味にする | ボタン 1 回で、押した時刻のレコードを作れる。対応するターゲットで動く |
| OP9-2 | **MCP の変更を画面に反映する。** エディタがファイルの変更に気づいて読み込み直す。編集中の変更があれば、上書きせずに知らせる                                                    | MCP で足したエンティティが、開き直さずに出る                          |
| OP9-3 | **画面の幅のプレビュー。** スマホ・タブレット・PC の幅に切り替える（例: 390px）                                                                                                | 画面の崩れをエディタの中で確かめられる                                |
| OP9-4 | **汎用の部品。** カードの一覧、下のタブ、時刻の入力、ボタンの大きさ。アプリ固有の見た目は `Custom` 部品で作り、組み込みにしない                                                | プレビューと両ターゲットの生成で同じに見える                          |

## 7. 全体の完了条件

### 書き出したものの確認

題材（`examples` の「機器の設定＆モニタリング」）を、`loading` が `all` のままと、`Device` を `paged` にしたものの 2 通りで書き出し、次がすべて通ること。

```sh
cd api-idl && npm install && npm run generate && npm run check
cd ../web-frontend && npm install && npm run lint && npm test && npm run build
cd ../test/backend && bun install && bun run typecheck && bun test
cd ../e2e && npm install && npm run install:browsers && npm test
```

**`api-idl` を最初に実行する。** `Dto` は `generated/api.d.ts` を読むので、先に `web-frontend` をビルドすると `tsc` が失敗する。書き出す `README.md` の手順も同じ順にする（D17）。

### リポジトリの確認

```sh
pnpm --filter "./original-poc/packages/**" build
pnpm --filter @ui-editor/poc-codegen test
pnpm --filter @ui-editor/poc-mcp test
pnpm typecheck && pnpm lint && pnpm format:check
```

調査のときの基準は、`poc-codegen` 40 件、`poc-mcp` 11 件がすべて成功。

### 再生成の確認

1. 書き出す。
2. Entity にメソッドを足す。
3. ER に項目を足して、もう一度書き出す。
4. 足したメソッドが残り、`DeviceBase`・Dto・`main.tsp` に項目が増えること。
5. フローに遷移を足して書き出すと、手を入れた `use<Name>Screen.ts` が残ったまま、新しい遷移が動くこと。
6. 生成のファイルを手で直すと、書き出しが止まること。
7. ER に必須の項目を足して書き出すと、Mock で古いデータが残っていても起動すること。

### 2 つめの題材での確認

MyLifeOS の要求から作った次の小さな ER を、アプリの名前を付けずに `examples/daily-log.poc.json` に置く。MCP だけで作り、一時フォルダへ書き出して、上の確認を通す（`MyLifeOS` のリポジトリには書き込まない）。

- `DailyRecord`（日付、起床時刻、到着時刻、退社時刻、就寝時刻、一言）
- `GymVisit`（日付、状態 `done` / `rest`）

どちらも日付を `unique` にし、`DailyRecord` は `loading: "paged"` にする。同じ日付の 2 件目が項目のエラーになることを、Mock と Http の両方で確かめる。

## 8. 気をつけること

| 点                   | 内容                                                                                                                                                                                                    |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 式の型               | 式は TS としてそのまま埋め込むので、View の型に合わなければ `tsc` で初めて分かる。View の項目名を ER の項目 id と同じにする                                                                             |
| 入れ子の一覧         | `data.Alarm` は親から作る読み取り専用の一覧。親が `paged` なら、**読み込んだ親の子だけ**である。全件を前提にする式は D20 で止める                                                                       |
| 名前のぶつかり       | テンプレートの名前（`Result`・`State`・`Collection`・`Application` など）は `Target.reservedEntityIds` に置く。共通の `RESERVED_ENTITY_IDS` に足すと、`vite-zustand` で今書き出せるプロジェクトが止まる |
| プレビューとの差     | プレビューは同期で全件を持ち、生成アプリは非同期で、`paged` なら一部だけを持つ。読み込み中の表示、主キーの値、`paged` の件数は差として認める                                                            |
| `requires`           | `state.selection.Device` は今と同じ形にする。選択の id だけを持ち、読むときに View を引く                                                                                                               |
| テンプレートの更新   | `vendor` は固定なので、テンプレートが変わっても自動では追いつかない。取り込み直す手順を `VENDOR.md` に書く。取り込み直したら、書き換えの一覧と `todo` のテストで漏れを見つける                          |
| 一意の項目           | `unique` は 1 項目だけ。組み合わせ（「利用者ごとに 1 日 1 件」）は `custom` のユースケースとサーバーで守る                                                                                              |
| カーソル             | テンプレートの例は読み飛ばす件数を入れるので、読み込みの途中で削除が起きると 1 件読み飛ばすことがある。`test/backend` は例のままでよい。本番のサーバーはキーセット方式にする                            |
| 本番の配信           | `BrowserRouter` を使うので、すべてのパスで `index.html` を返す設定が要る。書き出す `README.md` に書く                                                                                                   |
| 生成の量             | Value Object の 1 項目 1 ファイルで増える。性能は NFR-04 の bench で確かめる                                                                                                                            |
| 書き出しの `export/` | リポジトリのルートに未追跡の `export/` がある。作業に含めない                                                                                                                                           |

## 9. 文書の更新

- [architecture.md](../original-poc/docs/architecture.md): 4.12 にターゲットの節を足す。8 章に OP8・OP9 を足す。変更履歴に書く。
- [getting-started.md](../original-poc/docs/getting-started.md): 書き出しの手順に `target` を足す。
- `packages/mcp/README.md`: `export_code` の `target`・`force` を足す。`overwrite` との関係を書く（`vite-zustand` は今のまま。`architecture-template` は 6.1 の規則）。`custom` アクションと `Custom` 部品の編集も書く。
- [architecture.md](../original-poc/docs/architecture.md) の 4 章に `Entity.loading` を足す。
- `original-poc/README.md`: 評価メモの「作り直し・追加が要るもの」のうち、解決したものを更新する。

## 10. 書き出した先で固有の要求を足すとき

書き出す `README.md` に、次の表を載せる。

| やりたいこと             | 書く所                                                          | ER を変えて再生成したとき |
| ------------------------ | --------------------------------------------------------------- | ------------------------- |
| エンティティの業務ルール | `Device.ts` にメソッドを足す                                    | 残る                      |
| 固有の処理               | `application/custom/` に書き、`extendApplication.ts` に登録する | 残る                      |
| 画面の処理を足す・替える | `use<Name>Screen.ts`                                            | 残る                      |
| 固有の部品               | `presentation/custom/` に書き、エディタで `Custom` 部品を置く   | 残る                      |
| 画面の形・項目・遷移     | エディタで直す。生成のファイルは手で直さない                    | 反映される                |
| 一覧の絞り込み・集計     | `use<Name>Screen.ts` で `<Entity>Query` を渡す（`paged`）       | 残る                      |

## 11. レビューの記録（2026-11-04）

`architecture-template` の `f8d0f56`、`ui-editor` の `c66579d`、`MyLifeOS` の実物と突き合わせた。MyLifeOS は README だけの状態で、固有の要求はこの提案書に書かれたものだけを根拠にした。

### 11.1 反映したこと

| 重さ | 問題                                                                                                                                | 反映先                   |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| 高   | Entity・ユースケース・Hook が、3.3 では生成、6.1 ではひな形で矛盾していた。ひな形のままだと、エディタで足した遷移が Hook に入らない | D15・3.3・6.1            |
| 高   | 組み込み以外のアクションと部品を書けず、固有の処理を画面から呼ぶには生成物を直すしかなかった                                        | D16・10 章・OP8-8        |
| 高   | `Dto` が読む `generated/*.d.ts` を `generate()` では作れない。7 章の順では `web-frontend` の `tsc` が失敗する                       | D17・7 章                |
| 高   | CLI の `--clean` が、手で書いたコードを消す                                                                                         | D18                      |
| 中   | `onDelete` をクライアントで順に行う案は、途中の失敗で参照が壊れ、本番のサーバーを持つアプリで使えなかった                           | D9・D10                  |
| 中   | Mock の保存キーが固定だと、ER を変えたあと古いデータの検証に失敗し、D2 の読み込みでアプリが起動しない                               | D11・7 章                |
| 中   | テンプレートから書き換えるファイルの一覧に漏れがあった（`tspconfig.yaml`・`playwright.config.ts`・`todoApi.ts` など）               | 3.2                      |
| 中   | 予約語を共通の表に足すと、`vite-zustand` の互換が壊れる                                                                             | 3.1・8 章                |
| 中   | ターゲットが閉じた union で、足すたびに本体を変える形だった                                                                         | 3.1                      |
| 中   | ブラウザからの再生成の流れが無かった。`GeneratedFile` の種類を OP8-7 で足すと、全部の生成処理を直すことになる                       | 3.1・OP8-1・OP8-7        |
| 中   | OP9-1 は OP8 より先に行えるのに、完了条件が「両ターゲット」で満たせなかった。`time` の対応も 3.4 に無かった                         | OP9-1・3.4               |
| 低   | 固有の事情が汎用の判断の理由になっていた（D2・D13、OP9 の見出し、7 章の題材名）                                                     | 1 章・D2・D13・OP9・7 章 |
| 低   | 依存を足すとテンプレートのロックファイルと合わない。D10 にパスの書き方が無かった                                                    | 3.2・D10                 |

### 11.2 オーナーの回答（2026-11-04）

| #   | 確認                                                           | 回答                                       | 反映                                                  |
| --- | -------------------------------------------------------------- | ------------------------------------------ | ----------------------------------------------------- |
| Q1  | ルーターとダイアログの処理を、`architecture-template` に戻すか | テンプレートに寄せた出力にする             | PR #26。0 章の規則 5、1.1、3.2、D5、D6                |
| Q2  | `unique` を poc-0 に足すか                                     | 足す                                       | #158 で実装。D19、OP8-9                               |
| Q3  | 「起動時に全件」で量は足りるか                                 | 全件読み込み以外もテンプレート側で対応する | PR #26。D2、D7、D9、D10、D20、5 章、OP8-3・4、7・8 章 |

Q1 の回答で「テンプレートは変更しない」という決まりをやめた。テンプレートを主とし、`vendor` はその写しである。

`Entity.loading` は回答を受けて提案者が決めた形である。ターゲット全体の 1 つの設定にする案より、マスタと大量のデータを同じアプリで分けられるのでこちらを既定にした。

### 11.3 PR #26 でテンプレートに足したもの

| 分類         | 内容                                                                                                         |
| ------------ | ------------------------------------------------------------------------------------------------------------ |
| Domain       | `shared/Page.ts`（`Page`・`PageRequest`）。Repository の `findPage(query)`・`findById(id)`                   |
| Application  | `ListTodoPage`・`GetTodo`                                                                                    |
| Infra        | `shared/paginate.ts`、`/todos/page?status&limit&cursor`、`/todos/{id}`（404 は `null`）                      |
| Presentation | `AppRoutes.tsx`、`shared/usePagedList.ts`（`loadMore`・`reload`）、`shared/DialogHost.tsx`、一覧と詳細の画面 |
| lib          | `lib/dialog`（`DialogStack`・`useDialogEntries`）、`Collection.putMany`                                      |
| 通信         | `Error.field`、`RepositoryError.field`                                                                       |
| 文書         | `ARCHITECTURE.md` の「画面遷移」「ダイアログ」「データの読み方」                                             |

`GET /todos` と `findAll` は残した。Preact 版は生成物と `Collection` だけを同期し、画面は変えていない。
