import type { Node, Project } from "@ui-editor/schema";

/** エディタで開く単位（画面・コンポーネント・ダイアログ）。どれも root のノードを 1 つ持つ。 */
export type DocKind = "screen" | "component" | "dialog";

export interface DocKey {
  kind: DocKind;
  id: string;
}

export const DOC_KIND_LABEL: Record<DocKind, string> = {
  screen: "画面",
  component: "コンポーネント",
  dialog: "ダイアログ",
};

export interface DocEntry {
  key: DocKey;
  label: string;
  root: Node;
}

export function listDocs(project: Project): DocEntry[] {
  return [
    ...project.screens.map((s) => ({
      key: { kind: "screen" as const, id: s.id },
      label: s.name,
      root: s.root,
    })),
    ...(project.components ?? []).map((c) => ({
      key: { kind: "component" as const, id: c.id },
      label: c.name ?? c.id,
      root: c.root,
    })),
    ...(project.dialogs ?? []).map((d) => ({
      key: { kind: "dialog" as const, id: d.id },
      label: d.name,
      root: d.root,
    })),
  ];
}

export function sameDoc(a: DocKey, b: DocKey): boolean {
  return a.kind === b.kind && a.id === b.id;
}

export function findDoc(project: Project, key: DocKey): DocEntry | undefined {
  return listDocs(project).find((d) => sameDoc(d.key, key));
}

/** ドキュメントの root を差し替えたプロジェクトを返す（元のプロジェクトは変えない）。 */
export function replaceDocRoot(project: Project, key: DocKey, root: Node): Project {
  switch (key.kind) {
    case "screen":
      return {
        ...project,
        screens: project.screens.map((s) => (s.id === key.id ? { ...s, root } : s)),
      };
    case "component":
      return {
        ...project,
        components: project.components?.map((c) => (c.id === key.id ? { ...c, root } : c)),
      };
    case "dialog":
      return {
        ...project,
        dialogs: project.dialogs?.map((d) => (d.id === key.id ? { ...d, root } : d)),
      };
  }
}
