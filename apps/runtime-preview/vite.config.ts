import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  // 並行で動かすプロトタイプとぶつからないよう固定（#1「開発サーバーのポート」）
  server: { port: 5176, strictPort: true },
  preview: { port: 5176, strictPort: true },
  // TS 型の解析に typescript（約 3.5 MB）をブラウザで使うため、警告の閾値を上げる
  build: { chunkSizeWarningLimit: 5000 },
});
