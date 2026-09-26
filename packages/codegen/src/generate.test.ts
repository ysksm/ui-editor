import { existsSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { EXAMPLES } from "./examples.js";
import { generate, generateRtkStore } from "./generate.js";
import { readProjectFile } from "./project-file.js";

const snapshotsDir = fileURLToPath(new URL("../snapshots/", import.meta.url));

function listFiles(dir: string): string[] {
  const out: string[] = [];
  if (!existsSync(dir)) return out;
  const walk = (d: string) => {
    for (const entry of readdirSync(d, { withFileTypes: true })) {
      const path = join(d, entry.name);
      if (entry.isDirectory()) walk(path);
      else out.push(relative(dir, path).split("\\").join("/"));
    }
  };
  walk(dir);
  return out.sort();
}

describe.each(EXAMPLES)("$name", ({ name, file }) => {
  const project = readProjectFile(file);

  it("2 回生成して全ファイルが一致する（決定性）", async () => {
    const first = await generate(project, { appName: name });
    const second = await generate(structuredClone(project), { appName: name });
    expect(second).toEqual(first);
  });

  // 生成結果は snapshots/<name>/ にそのまま置く（生成コードを読むためのサンプルも兼ねる）。
  // 更新: pnpm --filter @ui-editor/codegen snapshots:update
  it("スナップショットと一致する", async () => {
    const files = await generate(project, { appName: name });
    for (const f of files) {
      await expect(f.content).toMatchFileSnapshot(join(snapshotsDir, name, f.path));
    }
  });

  it("スナップショットに余分なファイルがない", async () => {
    const files = await generate(project, { appName: name });
    const stale = listFiles(join(snapshotsDir, name)).filter(
      (p) => !files.some((f) => f.path === p),
    );
    expect(stale, `snapshots/${name}/ から消してください`).toEqual([]);
  });
});

describe("RTK 版のストア（比較用）", () => {
  const example = EXAMPLES.find((e) => e.name === "device-monitor")!;

  it("スナップショットと一致する", async () => {
    const files = await generateRtkStore(readProjectFile(example.file));
    expect(files.map((f) => f.path)).toEqual(["src/store/appStore.ts"]);
    for (const f of files) {
      await expect(f.content).toMatchFileSnapshot(
        join(snapshotsDir, "rtk-store", example.name, f.path),
      );
    }
  });
});
