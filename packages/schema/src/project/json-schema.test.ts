import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { serializeJsonSchema } from "./json-schema.js";

describe("project.schema.json", () => {
  it("is up to date (run `pnpm --filter @ui-editor/schema gen:json-schema`)", () => {
    const committed = readFileSync(new URL("../../project.schema.json", import.meta.url), "utf8");
    expect(committed).toBe(serializeJsonSchema());
  });

  it("describes the recursive node and actions", () => {
    const schema = JSON.parse(serializeJsonSchema()) as { $defs: Record<string, unknown> };
    expect(Object.keys(schema.$defs)).toEqual(
      expect.arrayContaining(["Project", "Screen", "Node", "Action", "Style"]),
    );
  });
});
