import type { Project } from "@ui-editor/schema";
import { describe, expect, it } from "vitest";
import { extractFlow, sourceHandleOf } from "./extract";
import { loadExample } from "./example.test-util";

describe("extractFlow（題材ファイル）", () => {
  const graph = extractFlow(loadExample());

  it("画面 3 つとダイアログ 2 つがノードになる", () => {
    expect(graph.nodes.map((n) => `${n.kind}:${n.id}`)).toEqual([
      "screen:dashboard",
      "screen:devices",
      "screen:deviceSettings",
      "dialog:saveConfirm",
      "dialog:alarmDetail",
    ]);
  });

  it("navigate / openDialog が遷移になる（S1〜S3・D1 の 8 本）", () => {
    const pairs = graph.transitions.map((t) => `${t.source} -> ${t.target} (${t.kind})`);
    expect(pairs.sort()).toEqual(
      [
        "dashboard -> devices (navigate)", // S1 → S2
        "dashboard -> deviceSettings (navigate)", // S1 → S3（機器カード）
        "dashboard -> alarmDetail (openDialog)", // S1 → D2（アラーム行）
        "devices -> dashboard (navigate)", // S2 → S1
        "devices -> deviceSettings (navigate)", // S2 → S3（rowClick）
        "deviceSettings -> devices (navigate)", // S3 → S2
        "deviceSettings -> saveConfirm (openDialog)", // S3 → D1
        "saveConfirm -> devices (navigate)", // D1 → S2
      ].sort(),
    );
  });

  it("起点のパーツ・イベント・アクションの位置を持つ", () => {
    const byId = new Map(graph.transitions.map((t) => [t.id, t]));
    expect([...byId.keys()].sort()).toEqual(
      [
        "screen:dashboard/toDevices#click[0]",
        "screen:dashboard/deviceCard#click[0]",
        "screen:dashboard/alarmRow#click[0]",
        "screen:devices/toDashboard#click[0]",
        "screen:devices/deviceTable#rowClick[0]",
        "screen:deviceSettings/cancel#click[0]",
        "screen:deviceSettings/save#click[0]",
        // OK ボタンは updateData ×2 → closeDialog → navigate の 4 番目
        "dialog:saveConfirm/ok#click[3]",
      ].sort(),
    );
    const row = byId.get("screen:devices/deviceTable#rowClick[0]")!;
    expect(sourceHandleOf(row.trigger)).toBe("part:deviceTable");
  });
});

describe("extractFlow（題材以外の置き場所）", () => {
  const base = {
    schemaVersion: "0",
    name: "t",
    dataModel: { source: "" },
    sampleData: {},
  } as const;

  it("画面の mount とコンポーネント内のアクションも拾う", () => {
    const project: Project = {
      ...base,
      screens: [
        {
          id: "a",
          name: "A",
          path: "/",
          events: { mount: [{ type: "navigate", to: "b" }] },
          root: { id: "page", type: "Box", children: [{ id: "link", type: "Link" }] },
        },
        { id: "b", name: "B", path: "/b", root: { id: "page", type: "Box" } },
      ],
      components: [
        {
          id: "Link",
          root: {
            id: "btn",
            type: "Button",
            events: {
              click: [
                { type: "setState", path: "x", value: 1 },
                { type: "openDialog", dialog: "d" },
              ],
            },
          },
        },
      ],
      dialogs: [{ id: "d", name: "D", root: { id: "body", type: "Box" } }],
    };
    const { transitions } = extractFlow(project);
    expect(transitions.map((t) => [t.id, sourceHandleOf(t.trigger)])).toEqual([
      ["screen:a/@screen#mount[0]", "screen"],
      ["screen:a/link>Link.btn#click[1]", "part:link"],
    ]);
  });
});
