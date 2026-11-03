#!/usr/bin/env node
import { parseArgs } from "node:util";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createServer } from "./server.js";

const USAGE = `使い方: poc-mcp [--root <フォルダ>]

  --root  読み書きできるフォルダ（既定: カレントディレクトリ）

MCP のサーバーとして標準入出力で動く。標準出力はプロトコルが使うので、ログは標準エラーに出す。`;

try {
  const { values } = parseArgs({ options: { root: { type: "string" } } });
  const root = values.root ?? process.cwd();
  await createServer({ root }).connect(new StdioServerTransport());
  console.error(`poc-mcp: 起動しました（root: ${root}）`);
} catch (e) {
  console.error(e instanceof Error ? e.message : String(e));
  console.error(USAGE);
  process.exitCode = 1;
}
