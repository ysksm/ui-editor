import { nestParents, type Project } from "@ui-editor/poc-model";
import type { FileSet } from "../files.js";
import { PRETTIER_OPTIONS } from "../format.js";

/**
 * 生成するアプリの依存（リポジトリのロックファイルにある版。react-router は P1 と同じ）。
 * 生成のたびに最新版を調べると出力が変わるので、ここで固定する。
 */
export const APP_DEPENDENCIES = {
  react: "^19.3.0",
  "react-dom": "^19.3.0",
  "react-router": "^8.4.0",
  zustand: "^5.0.15",
} as const;

export const APP_DEV_DEPENDENCIES = {
  "@types/react": "^19.3.0",
  "@types/react-dom": "^19.3.0",
  "@vitejs/plugin-react": "^6.1.1",
  typescript: "^6.0.3",
  vite: "^8.3.1",
} as const;

/** 生成したアプリの開発サーバー・プレビューのポート（architecture.md 2 章）。 */
export const APP_PORT = 5181;

const json = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`;

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Vite + React + TS の土台（画面などの中身以外）。 */
export function emitAppFiles(files: FileSet, project: Project, appName: string): void {
  files.add(
    "package.json",
    json({
      name: appName,
      private: true,
      version: "0.0.0",
      type: "module",
      scripts: {
        dev: "vite",
        build: "tsc && vite build",
        preview: "vite preview",
        typecheck: "tsc",
      },
      dependencies: APP_DEPENDENCIES,
      devDependencies: APP_DEV_DEPENDENCIES,
    }),
  );
  files.add(".gitignore", "node_modules/\ndist/\n");
  files.add(".prettierrc.json", json(PRETTIER_OPTIONS));
  files.add(
    "tsconfig.json",
    json({
      compilerOptions: {
        target: "ES2022",
        lib: ["ES2023", "DOM", "DOM.Iterable"],
        module: "ESNext",
        moduleResolution: "bundler",
        jsx: "react-jsx",
        strict: true,
        noUnusedLocals: true,
        noUnusedParameters: true,
        noFallthroughCasesInSwitch: true,
        noEmit: true,
        isolatedModules: true,
        verbatimModuleSyntax: true,
        skipLibCheck: true,
        types: ["vite/client"],
      },
      include: ["src", "vite.config.ts"],
    }),
  );
  files.add(
    "vite.config.ts",
    `import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  server: { port: ${APP_PORT}, strictPort: true },
  preview: { port: ${APP_PORT}, strictPort: true },
});
`,
  );
  files.add(
    "index.html",
    `<!doctype html>
<html lang="ja">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <link rel="icon" href="data:," />
    <title>${escapeHtml(project.name)}</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
`,
  );
  files.add("README.md", readme(project, appName));
}

function readme(project: Project, appName: string): string {
  const nest = nestParents(project.entities);
  const names = new Map(project.entities.map((e) => [e.id, e.name]));
  const entities = project.entities.map((e) => {
    const n = nest.get(e.id);
    const where = n
      ? `${names.get(n.parent) ?? n.parent}の入れ子（\`${n.parent}.${n.field}\`）`
      : "ルート";
    return `| \`${e.id}\` | ${e.name} | ${where} |`;
  });
  return `# ${project.name}

${project.description ? `${project.description}\n\n` : ""}Original PoC のエディタで作ったプロジェクトから生成したアプリ（Vite + React + TypeScript、react-router、Zustand）。
生成したコードは、本番の開発の土台としてそのまま書き換えてよい。

## 動かす

\`\`\`sh
pnpm install
pnpm dev        # http://localhost:${APP_PORT}/
pnpm build      # 型の検査（tsc）とビルド
\`\`\`

## 構成

| パス | 中身 |
| --- | --- |
| \`src/model/types.ts\` | エンティティの型・パラメータの型（ER から生成） |
| \`src/model/schema.ts\` | ER（検証・採番・入れ子・削除の規則に使う） |
| \`src/model/data.ts\` | サンプルデータと state の初期値 |
| \`src/runtime/\` | 入れ子のデータの CRUD（エディタのプレビューと同じ規則）・値の表示の補助 |
| \`src/store/store.ts\` | アプリの状態（Zustand）: データ・state・選択・ダイアログ・お知らせ |
| \`src/store/records.ts\` | エンティティごとのデータの変更（\`createDevice\` など） |
| \`src/store/hooks.ts\` | 画面で使う値（\`useDataView\`・\`useUiState\`・\`useRecord\`） |
| \`src/ui/\` | 組み込みの部品（Box・Text・Button・入力欄・Select・Table・Dialog） |

データはメモリの中だけにある（再読み込みでサンプルデータに戻る）。API につなぐときは \`src/store/records.ts\` と \`src/store/store.ts\` の「データの変更」を書き換える。

## エンティティ

| id | 名前 | 位置 |
| --- | --- | --- |
${entities.join("\n")}

---

\`${appName}\` は poc-codegen で生成した。
`;
}

/** 仮のトップ画面（画面・ダイアログの生成は OP6-4）。ストア・フック・部品が型どおりにつながることを確かめる。 */
export function emitPlaceholderApp(project: Project): string {
  const rows = project.entities.map(
    (e) => `{ name: ${JSON.stringify(`${e.name}（${e.id}）`)}, count: data.${e.id}.length }`,
  );
  return `import { useDataView } from "./store/hooks";
import { Box } from "./ui/Box";
import { Table } from "./ui/Table";
import { Text } from "./ui/Text";

/** トップ画面（仮）。エンティティごとの件数を出す。 */
export function App() {
  const data = useDataView();
  return (
    <Box gap={12} style={{ padding: 24 }}>
      <Text variant="title" text=${JSON.stringify(project.name)} />
      <Table
        rows={[${rows.join(", ")}]}
        rowKey={(row) => row.name}
        columns={[
          { header: "エンティティ", value: (row) => row.name },
          { header: "件数", value: (row) => row.count },
        ]}
      />
    </Box>
  );
}
`;
}
