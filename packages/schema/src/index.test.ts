import { describe, expect, it } from "vitest";
import { SCHEMA_VERSION } from "./index.js";

describe("@ui-editor/schema", () => {
  it("exports the schema version", () => {
    expect(SCHEMA_VERSION).toBe("0");
  });
});
