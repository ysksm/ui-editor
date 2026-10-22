import { useMemo } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router";
import { SCREENS } from "./model/screens";
import type { ScreenName, ScreenParams } from "./model/types";
import { closeAllDialogs, closeDialog, dismissNotice, useAppStore } from "./store/store";

/**
 * 画面の移動（1 画面 = 1 ルート）。パスの `:name` はパラメータの値、ほかのパラメータはクエリ文字列にする。
 * エディタのプレビューとの違い: navigate は履歴を積むだけ（履歴に同じ画面があってもそこまで戻さない）。
 */

/** パラメータの無い画面は navigate("devices") のように省ける。 */
type ParamsArg<S extends ScreenName> =
  Record<never, never> extends ScreenParams[S]
    ? [params?: ScreenParams[S]]
    : [params: ScreenParams[S]];

/** 画面のパス。 */
export function screenPath(
  screen: ScreenName,
  params: Readonly<Record<string, unknown>> = {},
): string {
  const used = new Set<string>();
  const path = SCREENS[screen].path.replace(/:([A-Za-z_][A-Za-z0-9_]*)/g, (_, name: string) => {
    used.add(name);
    const v = params[name];
    return encodeURIComponent(v === undefined || v === null ? "" : String(v));
  });
  const query = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (!used.has(k) && v !== undefined && v !== null) query.set(k, String(v));
  }
  const q = query.toString();
  return q ? `${path}?${q}` : path;
}

/** 画面を移る・戻る関数。 */
export function useNavigator() {
  const go = useNavigate();
  return useMemo(
    () => ({
      /** 画面を移る（開いているダイアログは閉じる）。 */
      navigate<S extends ScreenName>(screen: S, ...[params]: ParamsArg<S>): void {
        closeAllDialogs();
        dismissNotice();
        void go(screenPath(screen, params));
      },
      /** 戻る: ダイアログが開いていれば最前面を閉じる（cancel）、無ければブラウザの履歴を 1 つ戻る。 */
      back(): void {
        if (useAppStore.getState().dialogs.length > 0) closeDialog("cancel");
        else if (((window.history.state as { idx?: number } | null)?.idx ?? 0) > 0) void go(-1);
      },
    }),
    [go],
  );
}

/** 画面のパラメータを URL（パスとクエリ文字列）から読む。 */
export function useScreenParams<S extends ScreenName>(screen: S): ScreenParams[S] {
  const pathParams = useParams();
  const [search] = useSearchParams();
  return useMemo(() => {
    const out: Record<string, unknown> = {};
    for (const [name, type] of Object.entries(SCREENS[screen].params)) {
      const raw = pathParams[name] ?? search.get(name) ?? undefined;
      if (raw === undefined) continue;
      out[name] = type === "number" ? Number(raw) : type === "boolean" ? raw === "true" : raw;
    }
    return out as ScreenParams[S];
  }, [screen, pathParams, search]);
}
