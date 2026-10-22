import { addContainer, findContainer } from "@ui-editor/poc-model";
import { useEditor } from "../state/store";
import { ContainerList } from "./flow/ContainerList";
import { ContainerPanel } from "./flow/ContainerPanel";

/** フロービュー（FR-FLOW）: 画面・ダイアログの一覧、フロー図、選んだもののパネル。 */
export function FlowView() {
  const project = useEditor((s) => s.project);
  const selection = useEditor((s) => s.selection);
  const edit = useEditor((s) => s.edit);
  const select = useEditor((s) => s.select);
  const selectedId = selection?.kind === "container" ? selection.id : undefined;
  const ref = selectedId ? findContainer(project, selectedId) : undefined;

  const add = (kind: "screen" | "dialog") => {
    let id = "";
    if (
      edit(
        kind === "screen" ? "画面を追加" : "ダイアログを追加",
        (d) => void (id = addContainer(d, kind)),
      )
    )
      select({ kind: "container", id });
  };

  return (
    <div className="flow-view">
      <div className="view-toolbar">
        <button className="primary" onClick={() => add("screen")}>
          ＋ 画面
        </button>
        <button className="primary" onClick={() => add("dialog")}>
          ＋ ダイアログ
        </button>
      </div>
      <div className="flow-body">
        <ContainerList project={project} selected={selectedId} />
        <div className="flow-canvas placeholder muted">フロー図は #101 で作る。</div>
        {ref ? (
          <ContainerPanel key={ref.container.id} project={project} info={ref} />
        ) : (
          <aside className="inspector muted" aria-label="選んだものの編集">
            画面・ダイアログを選ぶと、ここで名前・id などを編集できます。
          </aside>
        )}
      </div>
    </div>
  );
}
