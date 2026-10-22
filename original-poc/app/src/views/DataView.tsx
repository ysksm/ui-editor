import { walkData } from "@ui-editor/poc-model";
import { useMemo } from "react";
import { useEditor } from "../state/store";
import { Placeholder } from "./Placeholder";

export function DataView() {
  const project = useEditor((s) => s.project);
  const counts = useMemo(() => {
    const out = new Map<string, number>();
    walkData(project, ({ entity }) => out.set(entity.id, (out.get(entity.id) ?? 0) + 1));
    return out;
  }, [project]);
  return (
    <Placeholder title="データ" note="サンプルデータの編集・生成は #92 で作る。">
      <ul>
        {project.entities.map((e) => (
          <li key={e.id}>
            {e.name}（{e.id}）: {counts.get(e.id) ?? 0} 件
          </li>
        ))}
      </ul>
    </Placeholder>
  );
}
