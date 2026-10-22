import type { Project } from "./schema.js";

/** 空のプロジェクト。 */
export function emptyProject(): Project {
  return {
    schemaVersion: "poc-0",
    name: "空",
    entities: [],
    data: {},
    state: {},
    screens: [],
    dialogs: [],
  };
}

/** 機器とアラーム（入れ子）、一覧・詳細・削除確認の小さなプロジェクト。 */
export function smallProject(): Project {
  return {
    schemaVersion: "poc-0",
    name: "小さな題材",
    entry: "devices",
    entities: [
      {
        id: "Device",
        name: "機器",
        primaryKey: "id",
        displayField: "name",
        fields: [
          { id: "id", type: "id" },
          { id: "name", name: "名前", type: "string", required: true },
          { id: "status", type: "enum", values: ["online", "offline"] },
          { id: "alarms", type: "children", entity: "Alarm" },
        ],
      },
      {
        id: "Alarm",
        name: "アラーム",
        primaryKey: "id",
        displayField: "message",
        fields: [
          { id: "id", type: "id" },
          { id: "message", type: "string" },
          { id: "acknowledged", type: "boolean", default: false },
        ],
      },
    ],
    data: {
      Device: [
        {
          id: "dev-001",
          name: "ルーター A",
          status: "online",
          alarms: [{ id: "alm-001", message: "CPU 高負荷", acknowledged: false }],
        },
      ],
    },
    state: { keyword: "" },
    screens: [
      {
        id: "devices",
        name: "機器一覧",
        kind: "list",
        entity: "Device",
        root: {
          id: "page",
          type: "Box",
          children: [
            {
              id: "table",
              type: "Table",
              props: { rows: "{{ data.Device }}", entity: "Device" },
              events: {
                rowClick: [
                  {
                    type: "navigate",
                    to: "deviceDetail",
                    params: { deviceId: "{{ event.row.id }}" },
                  },
                ],
              },
            },
          ],
        },
      },
      {
        id: "deviceDetail",
        name: "機器詳細",
        kind: "detail",
        entity: "Device",
        path: "/devices/:deviceId",
        params: { deviceId: { type: "ref", entity: "Device", required: true } },
        root: {
          id: "page",
          type: "Box",
          children: [
            {
              id: "btn1",
              type: "Button",
              props: { label: "削除の確認へ" },
              events: {
                click: [
                  {
                    type: "openDialog",
                    dialog: "deviceDelete",
                    params: { deviceId: "{{ params.deviceId }}" },
                    onClose: { ok: [{ type: "navigate", to: "devices" }] },
                  },
                ],
              },
            },
          ],
        },
      },
    ],
    dialogs: [
      {
        id: "deviceDelete",
        name: "削除の確認",
        kind: "confirm",
        entity: "Device",
        params: { deviceId: { type: "ref", entity: "Device", required: true } },
        root: {
          id: "body",
          type: "Box",
          children: [
            {
              id: "ok",
              type: "Button",
              props: { label: "削除する", variant: "danger" },
              events: {
                click: [
                  {
                    type: "deleteRecord",
                    entity: "Device",
                    match: { id: "{{ params.deviceId }}" },
                  },
                  { type: "closeDialog", result: "ok" },
                ],
              },
            },
          ],
        },
      },
    ],
    layout: { flow: { devices: { x: 0, y: 0 } } },
  };
}
