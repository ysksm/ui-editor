import type { Project } from "@ui-editor/schema";
import { describe, expect, it } from "vitest";
import { loadExample } from "../graph/example.test-util";
import { activeOwner, enterScreen, hotspotsOf, initialState, runActions } from "./player";

const project = loadExample();

function root(id: string) {
  const owner = [...project.screens, ...(project.dialogs ?? [])].find((o) => o.id === id)!;
  return owner.root;
}

function click(state: ReturnType<typeof initialState>, nodeId: string) {
  const owner = activeOwner(state);
  const hotspot = hotspotsOf(project, root(owner.id)).get(nodeId);
  if (!hotspot) throw new Error(`${owner.id} に ${nodeId} のホットスポットがありません`);
  return runActions(project, state, hotspot.actions);
}

describe("ホットスポット", () => {
  it("遷移に関わるアクションを持つパーツだけ", () => {
    expect([...hotspotsOf(project, root("dashboard")).keys()]).toEqual([
      "toDevices",
      "deviceCard",
      "alarmRow",
    ]);
    // 入力欄の change（setState のみ）は入らない。キャンセル・保存は入る
    expect([...hotspotsOf(project, root("deviceSettings")).keys()]).toEqual(["cancel", "save"]);
    expect(hotspotsOf(project, root("devices")).get("deviceTable")!.event).toBe("rowClick");
    // closeDialog を含むボタンも入る（確認済みにする = updateData → closeDialog）
    expect([...hotspotsOf(project, root("alarmDetail")).keys()]).toEqual(["close", "acknowledge"]);
  });

  it("コンポーネント内のイベントはインスタンスのホットスポットになる", () => {
    const p: Project = {
      ...project,
      components: [
        {
          id: "Link",
          root: { id: "a", type: "Text", events: { click: [{ type: "navigate", to: "devices" }] } },
        },
      ],
    };
    const r = { id: "page", type: "Box", children: [{ id: "link", type: "Link" }] };
    expect(hotspotsOf(p, r).get("link")!.actions).toEqual([{ type: "navigate", to: "devices" }]);
  });
});

describe("再生", () => {
  it("開始は entry の画面。ダイアログから始めると開始画面の上に開く", () => {
    expect(initialState(project)).toEqual({ screenId: "dashboard", dialog: null });
    expect(initialState(project, "devices")).toEqual({ screenId: "devices", dialog: null });
    expect(initialState(project, "alarmDetail")).toEqual({
      screenId: "dashboard",
      dialog: "alarmDetail",
    });
  });

  it("S1 → アラーム行で D2 → 閉じるで S1 に戻る", () => {
    let s = initialState(project);
    s = click(s, "alarmRow").state;
    expect(s).toEqual({ screenId: "dashboard", dialog: "alarmDetail" });
    expect(activeOwner(s)).toEqual({ kind: "dialog", id: "alarmDetail" });
    s = click(s, "close").state;
    expect(s).toEqual({ screenId: "dashboard", dialog: null });
  });

  it("S2 → 行クリックで S3（mount の setState は実行しない）→ 保存で D1 → OK で S2", () => {
    let s = initialState(project, "devices");
    const toSettings = click(s, "deviceTable");
    s = toSettings.state;
    expect(s.screenId).toBe("deviceSettings");
    expect(toSettings.log).toEqual([
      { text: "navigate → deviceSettings（deviceId: {{ event.row.id }}）", skipped: false },
      { text: "deviceSettings の mount", skipped: false },
      { text: "setState draftSettings（実行しない）", skipped: true },
    ]);
    s = click(s, "save").state;
    expect(s.dialog).toBe("saveConfirm");
    const ok = click(s, "ok");
    expect(ok.state).toEqual({ screenId: "devices", dialog: null });
    expect(ok.log.map((l) => l.skipped)).toEqual([true, true, false, false]);
  });

  it("ダイアログは同時に 1 つ。navigate では閉じない（P1 の生成コードと同じ）", () => {
    let s = initialState(project, "alarmDetail");
    s = runActions(project, s, [{ type: "openDialog", dialog: "saveConfirm" }]).state;
    expect(s).toEqual({ screenId: "dashboard", dialog: "saveConfirm" });
    s = runActions(project, s, [{ type: "navigate", to: "devices" }]).state;
    expect(s).toEqual({ screenId: "devices", dialog: "saveConfirm" });
  });

  it("mount の navigate（リダイレクト）をたどり、ループは上限で止める", () => {
    const p: Project = {
      ...project,
      screens: project.screens.map((sc) =>
        sc.id === "dashboard"
          ? { ...sc, events: { mount: [{ type: "navigate", to: "devices" }] } }
          : sc.id === "devices"
            ? { ...sc, events: { mount: [{ type: "navigate", to: "dashboard" }] } }
            : sc,
      ),
    };
    const r = enterScreen(p, initialState(p));
    expect(r.log.filter((l) => l.text.startsWith("navigate")).length).toBe(11);
    expect(r.log.at(-1)!.text).toBe("mount の遷移が多すぎるので止めました");
    expect(["dashboard", "devices"]).toContain(r.state.screenId);
  });
});
