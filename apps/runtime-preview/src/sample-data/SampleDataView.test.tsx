import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { loadExampleProject } from "../example";
import { setField } from "./edit";
import { SampleDataView } from "./SampleDataView";

describe("SampleDataView", () => {
  it("renders collections and highlights mismatched values", () => {
    const project = loadExampleProject();
    const render = (sampleData = project.sampleData) =>
      renderToStaticMarkup(
        <SampleDataView
          dataModelSource={project.dataModel.source}
          sampleData={sampleData}
          onChange={() => {}}
        />,
      );
    const html = render();
    expect(html).toContain("コレクション（4）");
    expect(html).toContain("Alarm[]");
    expect(html).not.toContain("invalid-cell");

    const broken = render(setField(project.sampleData, "alarms", 0, "acknowledged", "yes"));
    expect(broken).toContain("invalid-cell");
    expect(broken).toContain("boolean が必要ですが &quot;yes&quot; です");
  });
});
