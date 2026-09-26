import { describe, expect, it } from "vitest";
import { sampleData } from "../domain/sample-data.js";
import { miniProject } from "./fixture.test-util.js";
import type { Project } from "./schema.js";
import { formatIssue, validateProject } from "./validate.js";

function messages(project: unknown): string[] {
  const result = validateProject(project);
  return result.success ? [] : result.issues.map(formatIssue);
}

function mutate(fn: (p: Project) => void): Project {
  const p = miniProject();
  fn(p);
  return p;
}

describe("validateProject: shape", () => {
  it("accepts a valid project", () => {
    expect(messages(miniProject())).toEqual([]);
  });

  it("rejects unknown keys and wrong types with a path", () => {
    const p = miniProject() as unknown as Record<string, unknown>;
    p["unknownKey"] = 1;
    expect(messages(p).join("\n")).toMatch(/unknownKey/);

    const bad = mutate((q) => {
      (q.screens[0]!.root.style as Record<string, unknown>)["flexDirection"] = "diagonal";
    });
    expect(messages(bad)).toEqual([
      expect.stringMatching(/^screens\[0\]\.root\.style\.flexDirection: /),
    ]);
  });

  it("rejects unknown action types", () => {
    const bad = mutate((q) => {
      q.screens[0]!.root.children![0]!.events!["click"]!.push({ type: "reload" } as never);
    });
    expect(messages(bad)).toHaveLength(1);
  });

  it("accepts the domain sample data as project sampleData", () => {
    const p = mutate((q) => {
      q.sampleData = { ...q.sampleData, ...(sampleData as unknown as Project["sampleData"]) };
    });
    expect(messages(p)).toEqual([]);
  });
});

describe("validateProject: references", () => {
  const cases: [string, (p: Project) => void, RegExp][] = [
    [
      "navigate to a missing screen",
      (p) => {
        p.screens[0]!.root.children![0]!.events!["click"]![1] = { type: "navigate", to: "nope" };
      },
      /画面 "nope" がありません/,
    ],
    [
      "navigate with an unknown param",
      (p) => {
        p.screens[0]!.root.children![0]!.events!["click"]![1] = {
          type: "navigate",
          to: "detail",
          params: { itemId: "x", extra: 1 },
        };
      },
      /"extra" は定義されていません/,
    ],
    [
      "navigate without a required param",
      (p) => {
        p.screens[0]!.root.children![0]!.events!["click"]![1] = { type: "navigate", to: "detail" };
      },
      /必須の "itemId"/,
    ],
    [
      "open a missing dialog",
      (p) => {
        p.screens[1]!.root.children![0]!.events!["click"]![0] = {
          type: "openDialog",
          dialog: "nope",
        };
      },
      /ダイアログ "nope" がありません/,
    ],
    [
      "setState on an undeclared key",
      (p) => {
        p.screens[0]!.root.children![0]!.events!["click"]![0] = {
          type: "setState",
          path: "foo.bar",
          value: 1,
        };
      },
      /state に "foo"/,
    ],
    [
      "updateData on a missing collection",
      (p) => {
        p.dialogs![0]!.root.events!["click"]![0] = {
          type: "updateData",
          collection: "nope",
          match: {},
          set: {},
        };
      },
      /コレクション "nope"/,
    ],
    [
      "unknown node type",
      (p) => {
        p.screens[0]!.root.children![0]!.type = "Nope";
      },
      /type "Nope"/,
    ],
    [
      "component instance with a missing prop",
      (p) => {
        delete p.screens[0]!.root.children![0]!.props;
      },
      /必須の "item"/,
    ],
    [
      "duplicate node id",
      (p) => {
        p.screens[1]!.root.children![0]!.id = "root";
      },
      /ノード id "root" が重複/,
    ],
    [
      "duplicate top-level id",
      (p) => {
        p.dialogs![0]!.id = "list";
      },
      /id "list" が重複/,
    ],
    [
      "component named like a builtin",
      (p) => {
        p.components![0]!.id = "Text";
      },
      /組み込みの type と同じ名前/,
    ],
    [
      "path param not declared",
      (p) => {
        p.screens[1]!.path = "/items/:itemId/:tab";
      },
      /パラメータ "tab"/,
    ],
    [
      "entry not found",
      (p) => {
        p.entry = "nope";
      },
      /^entry: /,
    ],
    [
      "broken template",
      (p) => {
        p.components![0]!.root.props = { text: "{{ props.item.label" };
      },
      /閉じられていません/,
    ],
  ];

  it.each(cases)("reports %s", (_, fn, pattern) => {
    const result = messages(mutate(fn));
    expect(result).toEqual(expect.arrayContaining([expect.stringMatching(pattern)]));
  });
});
