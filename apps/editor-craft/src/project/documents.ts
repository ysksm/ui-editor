import { BUILTIN_NODE_TYPES, type Node, type ParamDef, type Project } from "@ui-editor/schema";

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

/** 画面・ダイアログ・コンポーネントの新しいルート（縦並びの Box）。 */
function newRoot(kind: DocKind): Node {
  const style =
    kind === "component"
      ? { display: "flex" as const, flexDirection: "column" as const, gap: 4, padding: 16 }
      : { display: "flex" as const, flexDirection: "column" as const, gap: 16, padding: 24 };
  return {
    id: kind === "screen" ? "page" : kind === "dialog" ? "body" : "root",
    type: "Box",
    style,
    children: [],
  };
}

const DOC_ID = /^[A-Za-z][A-Za-z0-9_-]*$/;
const COMPONENT_ID = /^[A-Z][A-Za-z0-9]*$/;

/** 新しいドキュメントの id として使えなければ理由を返す。 */
export function checkNewDocId(project: Project, kind: DocKind, id: string): string | undefined {
  if (kind === "component") {
    if (!COMPONENT_ID.test(id))
      return "コンポーネント id は PascalCase（例: KpiCard）で指定してください";
    if ((BUILTIN_NODE_TYPES as readonly string[]).includes(id))
      return `${id} は組み込みのパーツ名です`;
  } else if (!DOC_ID.test(id)) {
    return "id は英字で始まる英数字・_・- で指定してください";
  }
  if (listDocs(project).some((d) => d.key.kind === kind && d.key.id === id)) {
    return `${id} は既にあります`;
  }
  return undefined;
}

/** 空のドキュメントを追加したプロジェクトを返す。`root` を渡すとそれをルートにする。 */
export function addDoc(
  project: Project,
  kind: DocKind,
  id: string,
  name: string,
  root?: Node,
): Project {
  const r = root ?? newRoot(kind);
  switch (kind) {
    case "screen": {
      const paths = new Set(project.screens.map((s) => s.path));
      let path = `/${id}`;
      for (let i = 2; paths.has(path); i++) path = `/${id}${i}`;
      return { ...project, screens: [...project.screens, { id, name, path, root: r }] };
    }
    case "component":
      return { ...project, components: [...(project.components ?? []), { id, name, root: r }] };
    case "dialog":
      return { ...project, dialogs: [...(project.dialogs ?? []), { id, name, root: r }] };
  }
}

/** ドキュメントの設定（名前・パス・引数の定義）。 */
export interface DocMeta {
  name: string;
  /** 画面のみ。 */
  path?: string;
  /** 画面・ダイアログは params、コンポーネントは props。 */
  params: Record<string, ParamDef>;
}

export function getDocMeta(project: Project, key: DocKey): DocMeta | undefined {
  switch (key.kind) {
    case "screen": {
      const s = project.screens.find((x) => x.id === key.id);
      return s && { name: s.name, path: s.path, params: s.params ?? {} };
    }
    case "component": {
      const c = project.components?.find((x) => x.id === key.id);
      return c && { name: c.name ?? "", params: c.props ?? {} };
    }
    case "dialog": {
      const d = project.dialogs?.find((x) => x.id === key.id);
      return d && { name: d.name, params: d.params ?? {} };
    }
  }
}

/** 設定を書き換えたプロジェクトを返す。空の params は取り除く。 */
export function setDocMeta(project: Project, key: DocKey, meta: DocMeta): Project {
  const params = Object.keys(meta.params).length > 0 ? meta.params : undefined;
  switch (key.kind) {
    case "screen":
      return {
        ...project,
        screens: project.screens.map((s) =>
          s.id === key.id ? { ...s, name: meta.name, path: meta.path ?? s.path, params } : s,
        ),
      };
    case "component":
      return {
        ...project,
        components: project.components?.map((c) =>
          c.id === key.id ? { ...c, name: meta.name || undefined, props: params } : c,
        ),
      };
    case "dialog":
      return {
        ...project,
        dialogs: project.dialogs?.map((d) =>
          d.id === key.id ? { ...d, name: meta.name, params } : d,
        ),
      };
  }
}
