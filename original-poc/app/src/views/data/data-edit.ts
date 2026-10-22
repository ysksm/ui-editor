import type { DataChange, DataResult } from "@ui-editor/poc-datastore";
import { describeRecord, findRecord } from "@ui-editor/poc-datastore";
import { formatPath, type Issue, type Project } from "@ui-editor/poc-model";
import type { EditorStore } from "../../state/store";

/** datastore の結果をプロジェクトに反映する（Undo できる）。失敗なら通知に出して false。 */
export function applyDataResult(store: EditorStore, label: string, result: DataResult): boolean {
  const s = store.getState();
  if (!result.ok) {
    const fields = Object.entries(result.fieldErrors ?? {})
      .map(([k, v]) => `${k}: ${v}`)
      .join("、");
    s.setNotice({
      kind: "error",
      text: `${label}できませんでした: ${result.error}${fields ? `（${fields}）` : ""}`,
    });
    return false;
  }
  if (result.changes.length === 0) return true;
  // datastore は変わった枝だけ作り直すので、data を丸ごと差し替えても履歴は参照を持つだけで済む
  return s.edit(label, (d) => void (d.data = result.data));
}

/** 削除の結果の説明（「機器「機器 1」を削除しました（アラーム 3 件も削除）」）。 */
export function describeChanges(project: Project, changes: readonly DataChange[]): string {
  const byEntity = new Map(project.entities.map((e) => [e.id, e]));
  const main = changes.filter((c) => c.reason === "match");
  const extra = new Map<string, number>();
  for (const c of changes) {
    if (c.reason === "match") continue;
    const key = `${byEntity.get(c.entity)?.name ?? c.entity}${c.kind === "delete" ? "" : "（null にした）"}`;
    extra.set(key, (extra.get(key) ?? 0) + 1);
  }
  const head = main
    .map((c) => {
      const e = byEntity.get(c.entity);
      const loc = e ? findRecord(project, project.data, c.entity, c.id) : undefined;
      return `${e?.name ?? c.entity}「${loc && e ? describeRecord(e, loc.record) : c.id}」`;
    })
    .join("、");
  const tail = [...extra].map(([name, n]) => `${name} ${n} 件`).join("、");
  return tail ? `${head}（${tail}も）` : head;
}

/** 検証の問題を「data の中の場所（formatPath）」→ メッセージにまとめる（セルの強調用）。 */
export function dataIssueMap(issues: readonly Issue[]): Map<string, Issue[]> {
  const out = new Map<string, Issue[]>();
  for (const i of issues) {
    if (i.path[0] !== "data") continue;
    const key = formatPath(i.path.slice(1));
    out.set(key, [...(out.get(key) ?? []), i]);
  }
  return out;
}
