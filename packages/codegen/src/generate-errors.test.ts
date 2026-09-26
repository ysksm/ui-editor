import type { Project } from "@ui-editor/schema";
import { describe, expect, it } from "vitest";
import { generate } from "./generate.js";

function project(root: Project["screens"][number]["root"]): Project {
  return {
    schemaVersion: "0",
    name: "t",
    dataModel: { source: "interface Item { id: string }" },
    screens: [{ id: "home", name: "ホーム", path: "/", root }],
    sampleData: { items: [{ id: "a" }] },
  };
}

describe("変換できない式は生成時にエラー", () => {
  it("repeat の外で as の名前を使う", async () => {
    const p = project({
      id: "page",
      type: "Box",
      children: [
        { id: "list", type: "Box", repeat: { each: "{{ data.items }}", as: "item" } },
        { id: "label", type: "Text", props: { text: "{{ item.id }}" } },
      ],
    });
    await expect(generate(p, { appName: "t" })).rejects.toThrow(
      'screens.home のノード "label" の props.text: "item" はここでは参照できません',
    );
  });

  it("画面で props を使う", async () => {
    const p = project({ id: "page", type: "Text", props: { text: "{{ props.x }}" } });
    await expect(generate(p, { appName: "t" })).rejects.toThrow('"props" はここでは参照できません');
  });

  it("構文エラー", async () => {
    const p = project({ id: "page", type: "Box", visible: "{{ data.items.length > }}" });
    await expect(generate(p, { appName: "t" })).rejects.toThrow(
      'screens.home のノード "page" の visible: 式の構文エラー',
    );
  });
});
