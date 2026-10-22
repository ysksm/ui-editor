import { readdirSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { loadProject, serializeProject, type Project } from "@ui-editor/poc-model";
import { describe, expect, it } from "vitest";
import { generate, GenerateError } from "./generate.js";
import { EXAMPLES, readProjectFile } from "./node.js";

const example = readProjectFile(EXAMPLES[0].file);
const snapshots = fileURLToPath(new URL("../snapshots/device-monitor/", import.meta.url));

function walk(dir: string): string[] {
  try {
    return readdirSync(dir, { withFileTypes: true }).flatMap((d) =>
      d.isDirectory() ? walk(join(dir, d.name)) : [join(dir, d.name)],
    );
  } catch {
    return [];
  }
}

describe("generate（題材: 機器の設定＆モニタリング）", async () => {
  const files = await generate(example, { appName: "device-monitor" });

  it("生成結果がスナップショットと同じ（更新は pnpm --filter @ui-editor/poc-codegen snapshots:update）", async () => {
    for (const f of files) await expect(f.content).toMatchFileSnapshot(join(snapshots, f.path));
  });

  it("スナップショットのフォルダに、生成しなくなったファイルが残っていない", () => {
    const written = walk(snapshots).map((f) => relative(snapshots, f).split(sep).join("/"));
    expect(written.sort()).toEqual(files.map((f) => f.path).sort());
  });

  it("同じ入力なら同じ出力（読み書きし直しても同じ）", async () => {
    const reloaded = loadProject(serializeProject(example));
    if (!reloaded.success) throw new Error("読み直せません");
    expect(await generate(reloaded.project, { appName: "device-monitor" })).toEqual(files);
  });

  it("ER から型: 必須は T、必須でない項目は ?: T | null、入れ子は ?: Child[] / Child | null", () => {
    const types = files.find((f) => f.path === "src/model/types.ts")!.content;
    expect(types).toContain("  name: string;\n");
    expect(types).toContain('  status?: "online" | "offline" | "warning" | null;\n');
    expect(types).toContain("  settings?: DeviceSettings | null;\n");
    expect(types).toContain("  alarms?: Alarm[];\n");
    expect(types).toContain("  deviceDetail: { deviceId: string };\n");
  });
});

/** 題材を少し変えたもの。 */
function variant(recipe: (p: Project) => void): Project {
  const p = structuredClone(example);
  recipe(p);
  return p;
}

describe("generate の入力の検査と名前", () => {
  it("プロジェクトにエラーがあれば生成しない（場所付きの理由）", async () => {
    const broken = variant((p) => {
      p.entry = "nowhere";
    });
    const error = await generate(broken).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(GenerateError);
    expect((error as GenerateError).problems.join("\n")).toContain("entry");
  });

  it("生成するコードの名前とぶつかるエンティティ id はエラー", async () => {
    const p = variant((d) => {
      d.entities.push({
        id: "Values",
        name: "値",
        primaryKey: "id",
        fields: [{ id: "id", type: "id" }],
      });
      d.data.Values = [];
    });
    const error = await generate(p).catch((e: unknown) => e);
    expect((error as GenerateError).problems).toEqual(['エンティティ "Values"（値）']);
  });

  it("- を含む画面 id はキーを引用符で囲む", async () => {
    const p = variant((d) => {
      d.screens.push({
        id: "device-map",
        name: "機器の地図",
        params: { area: { type: "string" } },
      });
    });
    const types = (await generate(p)).find((f) => f.path === "src/model/types.ts")!.content;
    expect(types).toContain('  "device-map": { area?: string };\n');
  });
});
