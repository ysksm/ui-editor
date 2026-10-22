import { z } from "zod";
import type { Issue } from "./issues.js";
import { ProjectSchema, type Project } from "./schema.js";

export type ShapeResult = { success: true; project: Project } | { success: false; issues: Issue[] };

const ja = z.locales.ja();

/**
 * 形（zod のスキーマ）を検証する。失敗したら読み込めないので、問題はすべて `error`。
 * 参照・整合性は `validateProject`（validate.ts）で別に調べる。
 */
export function validateShape(input: unknown): ShapeResult {
  const parsed = ProjectSchema.safeParse(input, { error: ja.localeError });
  if (parsed.success) return { success: true, project: parsed.data };
  return { success: false, issues: parsed.error.issues.flatMap(toIssues) };
}

function toIssues(issue: z.core.$ZodIssue): Issue[] {
  const path = issue.path.map((p) => (typeof p === "symbol" ? String(p) : p));
  // 未知のキーは 1 つずつ、キーの場所を指す
  if (issue.code === "unrecognized_keys") {
    return issue.keys.map((key) => ({
      path: [...path, key],
      message: `未知のキー "${key}" です`,
      severity: "error",
    }));
  }
  // 判別できない type などは、選べる値を示す
  if (issue.code === "invalid_union" && "options" in issue && Array.isArray(issue.options)) {
    const options = (issue.options as unknown[]).map(String).join(" / ");
    return [{ path, message: `${options} のどれかを指定してください`, severity: "error" }];
  }
  return [{ path, message: issue.message, severity: "error" }];
}
