import { z } from "zod";
import { ProjectSchema } from "./schema.js";

/** プロジェクトファイルの JSON Schema（draft 2020-12）。 */
export function buildProjectJsonSchema(): Record<string, unknown> {
  return z.toJSONSchema(ProjectSchema, { io: "input" }) as Record<string, unknown>;
}

export function serializeJsonSchema(): string {
  return `${JSON.stringify(buildProjectJsonSchema(), null, 2)}\n`;
}
