import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

// Tauri の開発時のフロントエンド（src-tauri/tauri.conf.json の devUrl と合わせる）
export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  // editor-craft 側の react と同じものを使う（2 つ読み込まれるとフックが壊れる）
  resolve: { dedupe: ["react", "react-dom"] },
  server: { port: 5179, strictPort: true },
  preview: { port: 5179, strictPort: true },
});
