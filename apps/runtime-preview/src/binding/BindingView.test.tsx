import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { loadExampleProject } from "../example";
import { BindingView } from "./BindingView";

describe("BindingView", () => {
  it("evaluates the default template and lists the project's expressions", () => {
    const project = loadExampleProject();
    const unacknowledged = project.sampleData.alarms!.filter(
      (a) => !(a as { acknowledged: boolean }).acknowledged,
    ).length;
    const html = renderToStaticMarkup(<BindingView project={project} />);
    expect(html).toContain(`${unacknowledged} 件の未確認アラーム`);
    expect(html).toMatch(/プロジェクト内の式（\d+）/);
    expect(html).not.toContain("✗");
  });
});
