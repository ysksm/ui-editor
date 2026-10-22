import { useEditor } from "../state/store";
import { Placeholder } from "./Placeholder";

export function ErView() {
  const entities = useEditor((s) => s.project.entities);
  return (
    <Placeholder title="ER 図" note="エンティティの編集と ER 図は #91 で作る。">
      <ul>
        {entities.map((e) => (
          <li key={e.id}>
            {e.name}（{e.id}）: フィールド {e.fields.length}
          </li>
        ))}
      </ul>
    </Placeholder>
  );
}
