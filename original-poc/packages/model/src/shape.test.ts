import { describe, expect, it } from "vitest";
import { emptyProject, smallProject } from "./fixture.test-util.js";
import { formatIssue } from "./issues.js";
import { validateShape } from "./shape.js";

describe("validateShape", () => {
  it("空のプロジェクトと小さな題材は形が正しい", () => {
    expect(validateShape(emptyProject())).toMatchObject({ success: true });
    expect(validateShape(smallProject())).toMatchObject({ success: true });
  });

  it("schemaVersion が違うと読み込めない", () => {
    const r = validateShape({ ...emptyProject(), schemaVersion: "0" });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.issues[0]?.path).toEqual(["schemaVersion"]);
  });

  it("必須のキーが無いと場所付きのエラーになる", () => {
    const p: Record<string, unknown> = { ...emptyProject() };
    delete p.screens;
    const r = validateShape(p);
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.issues).toEqual([expect.objectContaining({ path: ["screens"], severity: "error" })]);
    }
  });

  it("未知のキーはキーの場所を指す", () => {
    const p = smallProject() as unknown as { screens: Record<string, unknown>[] };
    p.screens[0]!.titel = "typo";
    const r = validateShape(p);
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.issues).toEqual([
        { path: ["screens", 0, "titel"], message: '未知のキー "titel" です', severity: "error" },
      ]);
    }
  });

  it("id の書式の誤りを指す", () => {
    const p = smallProject();
    p.entities[0]!.id = "device";
    p.screens[1]!.id = "1detail";
    const r = validateShape(p);
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.issues.map((i) => i.path)).toEqual([
        ["entities", 0, "id"],
        ["screens", 1, "id"],
      ]);
      expect(r.issues[0]?.message).toContain("PascalCase");
    }
  });

  it("アクションの type が違うと、選べる値を示す", () => {
    const p = smallProject() as unknown as Record<string, never>;
    const action = (p as unknown as ReturnType<typeof smallProject>).screens[0]!.root!.children![0]!
      .events!.rowClick![0] as unknown as Record<string, unknown>;
    action.type = "goto";
    const r = validateShape(p);
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.issues[0]?.path).toEqual([
        "screens",
        0,
        "root",
        "children",
        0,
        "events",
        "rowClick",
        0,
        "type",
      ]);
      expect(r.issues[0]?.message).toContain("navigate / openDialog");
    }
  });

  it("openDialog の onClose の中のアクションも検証する", () => {
    const p = smallProject();
    const open = p.screens[1]!.root!.children![0]!.events!.click![0]!;
    if (open.type !== "openDialog") throw new Error("fixture");
    (open.onClose!.ok![0] as unknown as Record<string, unknown>).to = 42;
    const r = validateShape(p);
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(formatIssue(r.issues[0]!)).toMatch(
        /^エラー screens\[1\]\.root\.children\[0\]\.events\.click\[0\]\.onClose\.ok\[0\]\.to: /,
      );
    }
  });

  it("data は形をゆるく受け、レコードはオブジェクトであること", () => {
    const p = smallProject() as unknown as { data: Record<string, unknown[]> };
    p.data.Device!.push("not a record");
    const r = validateShape(p);
    expect(r.success).toBe(false);
    if (!r.success) expect(r.issues[0]?.path).toEqual(["data", "Device", 1]);
  });

  it("メッセージは日本語", () => {
    const r = validateShape({ ...emptyProject(), name: 3 });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.issues[0]?.message).toMatch(/期待/);
  });
});
