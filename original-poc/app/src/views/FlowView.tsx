import { useEditor } from "../state/store";
import { Placeholder } from "./Placeholder";

export function FlowView() {
  const screens = useEditor((s) => s.project.screens);
  const dialogs = useEditor((s) => s.project.dialogs);
  return (
    <Placeholder title="フロー図" note="画面一覧とフロー図はステップ 1（#75）で作る。">
      <ul>
        {screens.map((s) => (
          <li key={s.id}>
            画面: {s.name}（{s.id}）
          </li>
        ))}
        {dialogs.map((d) => (
          <li key={d.id}>
            ダイアログ: {d.name}（{d.id}）
          </li>
        ))}
      </ul>
    </Placeholder>
  );
}
