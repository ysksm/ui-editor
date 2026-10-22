import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  // 並行で動かすプロトタイプとぶつからないよう固定（#1「開発サーバーのポート」）
  server: { port: 5180, strictPort: true },
  preview: { port: 5180, strictPort: true },
  test: { environment: "jsdom" },
});
