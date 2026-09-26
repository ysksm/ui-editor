import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { loadExampleProject } from "../example";
import { Preview } from "./Preview";

describe("Preview", () => {
  it("renders S1 with the sample data and no binding errors", () => {
    const project = loadExampleProject();
    const html = renderToStaticMarkup(<Preview project={project} />);
    for (const d of project.sampleData.devices as { name: string }[])
      expect(html).toContain(d.name);
    expect(html.match(/data-node="deviceCard"/g)).toHaveLength(5);
    expect(html.match(/data-node="row"/g)).toHaveLength(5);
    expect(html).toContain("オンライン");
    expect(html).toMatch(/\d+(\.\d+)? ℃/);
    expect(html).not.toContain("pv-error");
  });
});
