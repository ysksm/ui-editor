import { useEffect, useMemo, useRef } from "react";
import { schema } from "../model/schema";
import type { DataView, Entities, EntityName, ScopeState, Selected } from "../model/types";
import { dataView, findRecord } from "../runtime/datastore";
import { useAppStore, type AppState } from "./store";

/**
 * 画面の式で使う名前（data・state・record）を返すフック。
 * イベントの中で、直前のアクションの結果を見るときは read〜 で読み直す。
 */

/** 式の data: ルートのエンティティは入れ子のまま、入れ子のエンティティは全親の子を並べた一覧。 */
export function useDataView(): DataView {
  return readDataView(useAppStore((s) => s.data));
}

/** 式の state: state と、選択中のレコード（state.selection.Device。無い・消えたなら null）。 */
export function useUiState(): ScopeState {
  const data = useAppStore((s) => s.data);
  const state = useAppStore((s) => s.state);
  const selection = useAppStore((s) => s.selection);
  return useMemo(() => withSelection({ data, state, selection }), [data, state, selection]);
}

/** 主キーでレコードを引く（無ければ null）。画面・ダイアログの record に使う。 */
export function useRecord<E extends EntityName>(entity: E, id: unknown): Entities[E] | null {
  return readRecord(
    entity,
    id,
    useAppStore((s) => s.data),
  );
}

/** 画面を作ったあと 1 回だけ実行する（画面の mount）。 */
export function useMount(effect: () => void): void {
  const done = useRef(false);
  useEffect(() => {
    if (done.current) return;
    done.current = true;
    effect();
    // 依存を空にして最初の 1 回だけ（StrictMode の 2 回目の実行も ref で飛ばす）
  }, []);
}

// ---- ストアから今の値を読む（イベントの中で使う） ----

export function readDataView(data = useAppStore.getState().data): DataView {
  return dataView(schema, data) as DataView;
}

export function readUiState(): ScopeState {
  return withSelection(useAppStore.getState());
}

export function readRecord<E extends EntityName>(
  entity: E,
  id: unknown,
  data = useAppStore.getState().data,
): Entities[E] | null {
  if (typeof id !== "string") return null;
  return (findRecord(schema, data, entity, id)?.record ?? null) as Entities[E] | null;
}

function withSelection({ data, state, selection }: Pick<AppState, "data" | "state" | "selection">) {
  const selected: Partial<Record<EntityName, unknown>> = {};
  for (const entity of schema.entities) {
    const name = entity.id as EntityName;
    selected[name] = readRecord(name, selection[name], data);
  }
  return { ...state, selection: selected as Selected };
}
