import type { Project } from "@ui-editor/schema";
import { PRETTIER_OPTIONS } from "./format.js";
import type { FileSet } from "./files.js";

/**
 * 生成するアプリの依存ライブラリ。
 * 生成のたびに最新版を調べると出力が変わるので、ここで固定する。
 */
export const APP_DEPENDENCIES = {
  react: "^19.3.0",
  "react-dom": "^19.3.0",
  zustand: "^5.0.15",
} as const;

export const APP_DEV_DEPENDENCIES = {
  "@types/react": "^19.3.0",
  "@types/react-dom": "^19.3.0",
  "@vitejs/plugin-react": "^6.1.1",
  typescript: "^6.0.3",
  vite: "^8.3.1",
} as const;

/** 生成したアプリの開発サーバーのポート（#1 の「開発サーバーのポート」）。 */
export const DEV_SERVER_PORT = 5178;

export interface AppTemplateOptions {
  /** package.json の name。 */
  appName: string;
}

/** Vite + React + TS の土台（画面などの中身以外）を書き出す。 */
export function writeAppTemplate(files: FileSet, project: Project, options: AppTemplateOptions) {
  files.add(
    "package.json",
    json({
      name: options.appName,
      private: true,
      version: "0.0.0",
      type: "module",
      scripts: {
        dev: "vite",
        build: "tsc && vite build",
        preview: "vite preview",
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
  server: { port: ${DEV_SERVER_PORT}, strictPort: true },
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
    <title>${escapeHtml(project.name)}</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
`,
  );
  files.add(
    "src/main.tsx",
    `import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
`,
  );
  files.add(
    "src/index.css",
    `*,
*::before,
*::after {
  box-sizing: border-box;
}

body {
  margin: 0;
  font-family: system-ui, sans-serif;
  color: #222;
}
`,
  );
}

function json(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
