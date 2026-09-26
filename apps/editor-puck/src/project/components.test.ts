import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { loadProject, validateProject, type Project } from "@ui-editor/schema";
import { describe, expect, it } from "vitest";
import {
  createComponent,
  createDialog,
  cyclicComponents,
  extractComponent,
  getParams,
  setParams,
} from "./components.ts";
import { getTree } from "./targets.ts";

const BUILTINS = new Set([
  "Box",
  "Text",
  "Button",
  "TextInput",
  "NumberInput",
  "Checkbox",
  "Table",
]);
const text = readFileSync(
  fileURLToPath(
    new URL("../../../../packages/schema/examples/device-monitor.project.yaml", import.meta.url),
  ),
  "utf8",
);

function example(): Project {
  const result = loadProject(text, "yaml");
  if (!result.success) throw new Error("題材ファイルを読めません");
  return result.project;
}

function ok(result: ReturnType<typeof createComponent>): Project {
  if (!result.ok) throw new Error(result.message);
  const valid = validateProject(result.project);
  expect(valid.success ? [] : valid.issues).toEqual([]);
  return result.project;
}

describe("コンポーネント・ダイアログの作成", () => {
  it("空のコンポーネントを作れる。名前の重複・組み込み名・形式はエラー", () => {
    const project = ok(createComponent(example(), "TempCard", "温度カード", BUILTINS));
    expect(project.components?.at(-1)).toMatchObject({ id: "TempCard", name: "温度カード" });
    expect(createComponent(project, "TempCard", "", BUILTINS).ok).toBe(false);
    expect(createComponent(project, "Box", "", BUILTINS).ok).toBe(false);
    expect(createComponent(project, "tempCard", "", BUILTINS).ok).toBe(false);
  });

  it("ダイアログを作れる", () => {
    const project = ok(createDialog(example(), "deleteConfirm", "削除確認"));
    expect(project.dialogs?.at(-1)).toMatchObject({ id: "deleteConfirm", name: "削除確認" });
    expect(createDialog(project, "deleteConfirm", "").ok).toBe(false);
  });

  it("選択したノードをコンポーネントにし、元の場所をインスタンスに置き換える", () => {
    const target = { kind: "screen", id: "dashboard" } as const;
    const project = ok(extractComponent(example(), target, "header", "PageHeader", "", BUILTINS));
    const root = getTree(project, target)!;
    expect(root.children?.[0]).toEqual({ id: "header", type: "PageHeader" });
    expect(project.components?.at(-1)?.root).toMatchObject({ id: "header", type: "Box" });
  });

  it("repeat / events はインスタンス側に残る", () => {
    const target = { kind: "screen", id: "dashboard" } as const;
    const project = ok(
      extractComponent(example(), target, "deviceCard", "DeviceCard", "", BUILTINS),
    );
    const component = project.components?.at(-1);
    expect(component?.root.repeat).toBeUndefined();
    expect(component?.root.events).toBeUndefined();
    const statusList = getTree(project, target)!.children![1]!.children![1]!;
    expect(statusList.children?.[0]).toMatchObject({
      id: "deviceCard",
      type: "DeviceCard",
      repeat: { as: "device" },
      events: { click: [{ type: "navigate" }] },
    });
  });

  it("props の定義を変えられる", () => {
    const target = { kind: "component", id: "MetricCard" } as const;
    const project = setParams(example(), target, { title: { type: "string" } });
    expect(getParams(project, target)).toEqual({ title: { type: "string" } });
  });

  it("編集中のコンポーネントと、それを使うコンポーネントは循環するので除外する", () => {
    const project = example();
    expect(cyclicComponents(project, "StatusBadge")).toEqual(new Set(["StatusBadge"]));
    const withWrapper: Project = {
      ...project,
      components: [
        ...(project.components ?? []),
        {
          id: "BadgeRow",
          root: { id: "r", type: "Box", children: [{ id: "b", type: "StatusBadge" }] },
        },
      ],
    };
    expect(cyclicComponents(withWrapper, "StatusBadge")).toEqual(
      new Set(["StatusBadge", "BadgeRow"]),
    );
  });
});
