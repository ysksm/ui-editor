import { relationDataLoss, relationProblem, type RelationKind } from "@ui-editor/poc-model";
import { useEditor } from "../../state/store";

export const RELATION_KINDS: {
  kind: RelationKind;
  label: string;
  describe: (from: string, to: string) => string;
}[] = [
  {
    kind: "one-to-many",
    label: "1 対多（入れ子）",
    describe: (from, to) => `${from} の下に ${to} を複数持つ（${from} に children を足す）`,
  },
  {
    kind: "one-to-one",
    label: "1 対 1（入れ子）",
    describe: (from, to) => `${from} の下に ${to} を 1 件持つ（${from} に children を足す）`,
  },
  {
    kind: "many-to-one",
    label: "多対 1（参照）",
    describe: (from, to) => `${from} から ${to} を指す（${from} に外部キーを足す）`,
  },
];

/** ER 図でノードをつないだときに、関係の種類を選ぶダイアログ。 */
export function RelationDialog({
  from,
  to,
  onChoose,
  onCancel,
}: {
  from: string;
  to: string;
  onChoose: (kind: RelationKind) => void;
  onCancel: () => void;
}) {
  const project = useEditor((s) => s.project);
  return (
    <div className="modal-backdrop">
      <div className="modal" role="dialog" aria-modal="true" aria-label="関係の種類">
        <p>
          <strong>{from}</strong> → <strong>{to}</strong> の関係の種類を選んでください
        </p>
        <div className="relation-options">
          {RELATION_KINDS.map(({ kind, label, describe }) => {
            const problem = relationProblem(project, from, to, kind);
            const loss = relationDataLoss(project, to, kind);
            return (
              <button key={kind} disabled={Boolean(problem)} onClick={() => onChoose(kind)}>
                <strong>{label}</strong>
                <span className="muted">{problem ?? describe(from, to)}</span>
                {!problem && loss > 0 && (
                  <span className="warn-text">
                    {to} のデータ {loss} 件は消えます（親の中に移せないため）
                  </span>
                )}
              </button>
            );
          })}
        </div>
        <div className="modal-actions">
          <button onClick={onCancel}>やめる</button>
        </div>
      </div>
    </div>
  );
}
