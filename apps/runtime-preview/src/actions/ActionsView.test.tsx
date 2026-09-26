import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { loadExampleProject } from "../example";
import { ActionsView } from "./ActionsView";

describe("ActionsView", () => {
  it("shows the screens and the first screen's node tree", () => {
    const html = renderToStaticMarkup(
      <ActionsView project={loadExampleProject()} onChange={() => {}} />,
    );
    expect(html).toContain("ダッシュボード");
    expect(html).toContain("保存確認");
    expect(html).toContain("deviceCard");
    expect(html).toContain("＋ mount イベント");
  });
});
