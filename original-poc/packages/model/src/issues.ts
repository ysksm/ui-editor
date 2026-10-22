/** 検証の問題。`path` はプロジェクトの JSON の中の場所。 */

export type IssuePath = (string | number)[];

/**
 * - `error`: 壊れている（存在しない画面への遷移、型の合わないデータなど）
 * - `warning`: 作りかけで普通に起きるもの（到達できない画面、仮の部品のままの遷移など）
 */
export type Severity = "error" | "warning";

export interface Issue {
  /** 問題の箇所。例: `["screens", 0, "root", "children", 1, "type"]` */
  path: IssuePath;
  message: string;
  severity: Severity;
}

/** `screens[0].root.children[1].type` の形にする。 */
export function formatPath(path: IssuePath): string {
  return path.reduce<string>(
    (acc, p) => (typeof p === "number" ? `${acc}[${p}]` : acc ? `${acc}.${p}` : p),
    "",
  );
}

export function formatIssue(issue: Issue): string {
  const mark = issue.severity === "error" ? "エラー" : "警告";
  return `${mark} ${formatPath(issue.path) || "(root)"}: ${issue.message}`;
}

export function hasErrors(issues: readonly Issue[]): boolean {
  return issues.some((i) => i.severity === "error");
}
