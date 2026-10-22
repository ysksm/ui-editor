import { useRef, useState } from "react";
import { schema } from "../model/schema";
import type { EntityFields, EntityName, Values } from "../model/types";
import { emptyRecord, entityOf, findRecord, type DataRecord } from "../runtime/datastore";
import { createRecord, updateRecords, useAppStore } from "./store";

export interface FormState<E extends EntityName> {
  draft: Values<E>;
  /** 項目 id → 検証のメッセージ（"" は項目に結びつかないもの）。 */
  errors: Partial<Record<string, string>>;
}

export interface Form<E extends EntityName> extends FormState<E> {
  /** 下書きの項目を変える（その項目のエラーは消す）。 */
  setDraft(field: EntityFields[E], value: unknown): void;
  /** 下書きを検証して保存する（レコードがあれば更新、無ければ作成）。成功なら true。 */
  saveDraft(): boolean;
  /** 今の下書きとエラー（同じイベントの中で setDraft したあとに読むとき）。 */
  read(): FormState<E>;
}

/**
 * フォームの下書き（エディタのプレビューの setDraft / saveDraft と同じ）。
 * 開いたときにレコード（recordId）があれば複製（編集）、無ければ既定値（作成）で作る。
 * 閉じれば（コンポーネントが消えれば）捨てる。入れ子のエンティティを作るときは parentId に親の主キーを渡す。
 */
export function useForm<E extends EntityName>(
  entity: E,
  options: { recordId?: unknown; parentId?: unknown } = {},
): Form<E> {
  const [state, setState] = useState<FormState<E>>(() => ({
    draft: initialDraft(entity, options.recordId),
    errors: {},
  }));
  const latest = useRef(state);
  const update = (next: FormState<E>) => {
    latest.current = next;
    setState(next);
  };
  return {
    ...state,
    read: () => latest.current,
    setDraft(field, value) {
      const errors = { ...latest.current.errors };
      delete errors[field];
      update({ draft: { ...latest.current.draft, [field]: value }, errors });
    },
    saveDraft() {
      const def = entityOf(schema, entity);
      if (!def) return false;
      const draft: DataRecord = latest.current.draft;
      const record = readRecord(entity, options.recordId);
      let result;
      if (record) {
        const set: DataRecord = {};
        for (const f of def.fields) {
          if (f.type === "children" || f.id === def.primaryKey) continue;
          if (draft[f.id] !== undefined) set[f.id] = draft[f.id];
        }
        const match = { [def.primaryKey]: record[def.primaryKey] };
        result = updateRecords(entity, match as Values<E>, set as Values<E>);
      } else {
        const values: DataRecord = {};
        for (const [k, v] of Object.entries(draft)) {
          if (k !== def.primaryKey || v !== "") values[k] = v;
        }
        const parent = typeof options.parentId === "string" ? options.parentId : undefined;
        result = createRecord(entity, values as Values<E>, parent);
      }
      if (!result.ok) {
        update({ ...latest.current, errors: result.fieldErrors ?? { "": result.error } });
        return false;
      }
      update({ ...latest.current, errors: {} });
      return true;
    },
  };
}

function readRecord(entity: EntityName, id: unknown): DataRecord | undefined {
  if (typeof id !== "string") return undefined;
  return findRecord(schema, useAppStore.getState().data, entity, id)?.record;
}

/** 開いたときの下書き（レコードの複製か既定値。入れ子の項目は除く）。 */
function initialDraft<E extends EntityName>(entity: E, recordId: unknown): Values<E> {
  const def = entityOf(schema, entity);
  if (!def) return {};
  const source = readRecord(entity, recordId) ?? emptyRecord(def);
  const draft: DataRecord = {};
  for (const f of def.fields) {
    if (f.type !== "children" && source[f.id] !== undefined) draft[f.id] = source[f.id];
  }
  return draft as Values<E>;
}
