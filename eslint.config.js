import js from "@eslint/js";
import prettier from "eslint-config-prettier";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "**/dist/**",
      "**/coverage/**",
      "**/node_modules/**",
      // Tauri（Rust）のビルド出力
      "**/src-tauri/target/**",
      "**/src-tauri/gen/**",
      // コード生成の出力
      "packages/codegen/snapshots/**",
      "packages/codegen/out/**",
      "original-poc/packages/codegen/snapshots/**",
      "original-poc/packages/codegen/out/**",
      // QA の出力（書き出したコードを展開したもの）
      "original-poc/app/qa/out/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.js", "**/*.mjs"],
    languageOptions: { globals: globals.node },
  },
  prettier,
);
