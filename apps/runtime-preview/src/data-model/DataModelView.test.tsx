import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { loadExampleProject } from "../example";
import { DataModelView } from "./DataModelView";

describe("DataModelView", () => {
  it("renders the model list and the first model's fields", () => {
    const html = renderToStaticMarkup(
      <DataModelView source={loadExampleProject().dataModel.source} onChange={() => {}} />,
    );
    expect(html).toContain("データモデル（4）");
    for (const name of ["Device", "DeviceSettings", "Metric", "Alarm", "DeviceStatus"])
      expect(html).toContain(`<span>${name}</span>`);
    expect(html).toContain("<code>ipAddress</code>");
    expect(html).not.toContain('class="diagnostics"');
  });
});
