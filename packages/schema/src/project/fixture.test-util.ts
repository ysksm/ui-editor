import type { Project } from "./schema.js";

/** テスト用の小さなプロジェクト。各テストで structuredClone して書き換える。 */
export function miniProject(): Project {
  return {
    schemaVersion: "0",
    name: "mini",
    entry: "list",
    dataModel: { source: "interface Item { id: string; label: string; done: boolean }" },
    state: {
      selectedId: { type: "string | null", initial: null },
    },
    screens: [
      {
        id: "list",
        name: "一覧",
        path: "/",
        root: {
          id: "root",
          type: "Box",
          style: { display: "flex", flexDirection: "column", gap: 8 },
          children: [
            {
              id: "row",
              type: "ItemRow",
              repeat: { each: "{{ data.items }}", as: "item", key: "{{ item.id }}" },
              props: { item: "{{ item }}" },
              events: {
                click: [
                  { type: "setState", path: "selectedId", value: "{{ item.id }}" },
                  { type: "navigate", to: "detail", params: { itemId: "{{ item.id }}" } },
                ],
              },
            },
          ],
        },
      },
      {
        id: "detail",
        name: "詳細",
        path: "/items/:itemId",
        params: { itemId: { type: "string" } },
        root: {
          id: "root",
          type: "Box",
          children: [
            {
              id: "done",
              type: "Button",
              props: { label: "完了にする" },
              events: {
                click: [
                  {
                    type: "openDialog",
                    dialog: "confirm",
                    params: { itemId: "{{ params.itemId }}" },
                  },
                ],
              },
            },
          ],
        },
      },
    ],
    components: [
      {
        id: "ItemRow",
        props: { item: { type: "Item" } },
        root: { id: "label", type: "Text", props: { text: "{{ props.item.label }}" } },
      },
    ],
    dialogs: [
      {
        id: "confirm",
        name: "確認",
        params: { itemId: { type: "string" } },
        root: {
          id: "ok",
          type: "Button",
          props: { label: "OK" },
          events: {
            click: [
              {
                type: "updateData",
                collection: "items",
                match: { id: "{{ params.itemId }}" },
                set: { done: true },
              },
              { type: "closeDialog" },
            ],
          },
        },
      },
    ],
    sampleData: {
      items: [
        { id: "a", label: "A", done: false },
        { id: "b", label: "B", done: true },
      ],
    },
  };
}
