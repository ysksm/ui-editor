import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { TEMPLATES } from "./templates.generated.js";

const root = fileURLToPath(new URL("../templates/", import.meta.url));

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((d) =>
    d.isDirectory() ? walk(join(dir, d.name)) : [join(dir, d.name)],
  );
}

describe("templates.generated.ts", () => {
  it("templates/ と同じ（ずれていたら pnpm --filter @ui-editor/poc-codegen embed）", () => {
    const files = Object.fromEntries(
      walk(root).map((f) => [relative(root, f).split(sep).join("/"), readFileSync(f, "utf8")]),
    );
    expect(Object.keys(TEMPLATES).sort()).toEqual(Object.keys(files).sort());
    for (const [path, content] of Object.entries(files))
      expect(TEMPLATES[path], path).toBe(content);
  });
});
