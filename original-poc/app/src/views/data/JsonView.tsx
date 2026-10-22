import { toFlat } from "@ui-editor/poc-datastore";
import { canonicalProject, type Project } from "@ui-editor/poc-model";
import { useMemo, useState } from "react";
import { download } from "../../state/files";

/** サンプルデータの JSON（入れ子＝保存する形、平ら＝エンティティごとの配列）の表示と書き出し。 */
export function JsonView({ project }: { project: Project }) {
  const [shape, setShape] = useState<"nested" | "flat">("nested");
  const text = useMemo(() => {
    const value =
      shape === "nested" ? canonicalProject(project).data : toFlat(project, project.data);
    return `${JSON.stringify(value, null, 2)}\n`;
  }, [project, shape]);
  return (
    <div className="json-view">
      <div className="json-toolbar">
        <button aria-pressed={shape === "nested"} onClick={() => setShape("nested")}>
          入れ子（保存する形）
        </button>
        <button aria-pressed={shape === "flat"} onClick={() => setShape("flat")}>
          平ら（エンティティごと、子は $parent 付き）
        </button>
        <button
          onClick={() => download(shape === "nested" ? "data.nested.json" : "data.flat.json", text)}
        >
          書き出す
        </button>
      </div>
      <pre aria-label="データの JSON">{text}</pre>
    </div>
  );
}
