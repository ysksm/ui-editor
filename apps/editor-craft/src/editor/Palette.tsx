import { useEditor, type Node as CraftNode } from "@craftjs/core";
import type { BuiltinNodeType, JsonValue, Style } from "@ui-editor/schema";
import type { ReactElement } from "react";
import { baseIdFor, ROOT_ID, uniqueNodeId, type NodeFields } from "../project/convert";
import { ComponentInstance, resolver } from "../parts/craft";
import { defaultPropsOf, useProject } from "../parts/view";

/** パレットの項目。`base` は新しいノードの id の元（`<base><連番>`）。 */
interface PaletteItem {
  label: string;
  base: string;
  element: (nodeId: string) => ReactElement;
}

type Part = (p: NodeFields) => ReactElement;
const parts = resolver as unknown as Record<BuiltinNodeType, Part>;

const containerStyle: Style = { display: "flex", flexDirection: "column", gap: 8, padding: 8 };
const cardStyle: Style = {
  display: "flex",
  flexDirection: "column",
  gap: 4,
  padding: 16,
  border: "1px solid #ddd",
  borderRadius: 8,
};

function builtinItems(): PaletteItem[] {
  const item = (
    label: string,
    base: string,
    type: BuiltinNodeType,
    props?: Record<string, JsonValue>,
    style?: Style,
  ): PaletteItem => ({
    label,
    base,
    element: (nodeId) => {
      const Part = parts[type];
      return <Part nodeId={nodeId} props={props} style={style} />;
    },
  });
  return [
    item("Container（flex）", "box", "Box", undefined, containerStyle),
    item("Card", "card", "Box", undefined, cardStyle),
    item("Text", "text", "Text", { text: "テキスト" }),
    item("Button", "button", "Button", { label: "ボタン", variant: "primary" }),
    item("Input（文字）", "textInput", "TextInput", { label: "ラベル", value: "" }),
    item("Input（数値）", "numberInput", "NumberInput", { label: "ラベル", value: 0 }),
    item("Checkbox", "checkbox", "Checkbox", { label: "ラベル", checked: false }),
    item("Table", "table", "Table", {
      rows: "{{ data.devices }}",
      columns: [
        { header: "名前", value: "{{ row.name }}" },
        { header: "ステータス", value: "{{ row.status }}" },
      ],
    }),
  ];
}

/** 使われている P0 の id を集める（新しいノードの id を重複させないため）。 */
function usedNodeIds(nodes: Record<string, CraftNode>): Set<string> {
  return new Set(
    Object.values(nodes)
      .map((n) => (n.data.props as NodeFields).nodeId)
      .filter((id): id is string => !!id),
  );
}

export function Palette() {
  const project = useProject();
  const { connectors, actions, query } = useEditor();

  const builtins = builtinItems();
  const components: PaletteItem[] = (project.components ?? []).map((c) => ({
    label: c.name ? `${c.id}（${c.name}）` : c.id,
    base: baseIdFor(c.id),
    element: (nodeId: string) => (
      <ComponentInstance
        nodeId={nodeId}
        component={c.id}
        props={defaultPropsOf(c.props, project.dataModel.source)}
      />
    ),
  }));

  const create = (item: PaletteItem) =>
    item.element(uniqueNodeId(item.base, usedNodeIds(query.getState().nodes)));

  /** クリックでも追加できる（選択中のコンテナ、なければルートの末尾）。 */
  const add = (item: PaletteItem) => {
    const state = query.getState();
    const selected = [...state.events.selected][0];
    let parent = selected ?? ROOT_ID;
    while (parent && !state.nodes[parent]?.data.isCanvas) {
      parent = state.nodes[parent]?.data.parent ?? "";
    }
    if (!parent) return;
    const tree = query.parseReactElement(create(item)).toNodeTree();
    actions.addNodeTree(tree, parent);
    actions.selectNode(tree.rootNodeId);
  };

  const button = (item: PaletteItem) => (
    <button
      key={item.label}
      type="button"
      className="palette-item"
      title="ドラッグしてキャンバスに置く（クリックで選択中のコンテナに追加）"
      ref={(el) => {
        if (el) {
          connectors.create(el, () => create(item), {
            // 置いたパーツをそのまま選択して、すぐ編集できるようにする
            onCreate: (tree) => actions.selectNode(tree.rootNodeId),
          });
        }
      }}
      onClick={() => add(item)}
    >
      {item.label}
    </button>
  );

  return (
    <div className="palette">
      {builtins.map(button)}
      {components.length > 0 && <div className="panel-subtitle">コンポーネント</div>}
      {components.map(button)}
    </div>
  );
}
