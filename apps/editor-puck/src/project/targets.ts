import type { Node, Project } from "@ui-editor/schema";

/** エディタで編集する 1 つのツリー（画面・ダイアログ・コンポーネントの root）。 */
export type TargetKind = "screen" | "dialog" | "component";
export interface Target {
  kind: TargetKind;
  id: string;
}

export interface TargetEntry extends Target {
  label: string;
}

const KIND_LABEL: Record<TargetKind, string> = {
  screen: "画面",
  dialog: "ダイアログ",
  component: "コンポーネント",
};

export function listTargets(project: Project): TargetEntry[] {
  return [
    ...project.screens.map((s) => ({ kind: "screen" as const, id: s.id, label: s.name })),
    ...(project.dialogs ?? []).map((d) => ({ kind: "dialog" as const, id: d.id, label: d.name })),
    ...(project.components ?? []).map((c) => ({
      kind: "component" as const,
      id: c.id,
      label: c.name ?? c.id,
    })),
  ];
}

export function kindLabel(kind: TargetKind): string {
  return KIND_LABEL[kind];
}

export function sameTarget(a: Target, b: Target): boolean {
  return a.kind === b.kind && a.id === b.id;
}

export function getTree(project: Project, target: Target): Node | undefined {
  switch (target.kind) {
    case "screen":
      return project.screens.find((s) => s.id === target.id)?.root;
    case "dialog":
      return project.dialogs?.find((d) => d.id === target.id)?.root;
    case "component":
      return project.components?.find((c) => c.id === target.id)?.root;
  }
}

export function setTree(project: Project, target: Target, root: Node): Project {
  const replace = <T extends { id: string; root: Node }>(list: T[]) =>
    list.map((item) => (item.id === target.id ? { ...item, root } : item));
  switch (target.kind) {
    case "screen":
      return { ...project, screens: replace(project.screens) };
    case "dialog":
      return { ...project, dialogs: replace(project.dialogs ?? []) };
    case "component":
      return { ...project, components: replace(project.components ?? []) };
  }
}
