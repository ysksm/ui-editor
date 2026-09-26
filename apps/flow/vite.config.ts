import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";
import { parseLayout, serializeLayout } from "./src/graph/layout-file.ts";

const LAYOUT_DIR = fileURLToPath(new URL("./layouts/", import.meta.url));

/**
 * 手動配置位置を `layouts/<name>.layout.json` に書き込む開発サーバー用の API。
 * `POST /api/layout?name=<name>`（本文は配置ファイルの JSON）。
 */
function layoutFilePlugin(): Plugin {
  return {
    name: "flow-layout-file",
    configureServer(server) {
      server.middlewares.use("/api/layout", (req, res) => {
        const name = new URL(req.url ?? "", "http://x").searchParams.get("name") ?? "";
        if (req.method !== "POST" || !/^[a-z0-9-]+$/.test(name)) {
          res.statusCode = 400;
          res.end("POST /api/layout?name=<英小文字・数字・->");
          return;
        }
        let body = "";
        req.setEncoding("utf8");
        req.on("data", (chunk: string) => (body += chunk));
        req.on("end", () => {
          void (async () => {
            try {
              const layout = parseLayout(body);
              await mkdir(LAYOUT_DIR, { recursive: true });
              await writeFile(
                `${LAYOUT_DIR}${name}.layout.json`,
                serializeLayout(layout.positions),
              );
              res.statusCode = 204;
              res.end();
            } catch (e) {
              res.statusCode = 400;
              res.end((e as Error).message);
            }
          })();
        });
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), layoutFilePlugin()],
  server: { port: 5177, strictPort: true },
  preview: { port: 5177, strictPort: true },
  // zod・yaml・React Flow を 1 つにまとめるため大きくなる（プロトタイプなので分割しない）
  build: { chunkSizeWarningLimit: 1000 },
});
