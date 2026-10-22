import { produce } from "immer";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { extractTransitions } from "../flow.js";
import { loadProject } from "../io.js";
import { formatIssue } from "../issues.js";
import type { Project } from "../schema.js";
import { checkProject } from "../validate.js";
import { findNode } from "../walk.js";
import { generateScreens } from "./generate.js";

const apply = (p: Project, recipe: (d: Project) => void) => produce(p, recipe);

function erOnly(): Project {
  const r = loadProject(
    readFileSync(new URL("../../../../examples/device-monitor.poc.json", import.meta.url), "utf8"),
  );
  if (!r.success) throw new Error("題材");
  return { ...r.project, entry: undefined, screens: [], dialogs: [], layout: undefined };
}

const pairs = (p: Project) =>
  extractTransitions(p).map((t) => `${t.from} -${t.node}.${t.event}-> ${t.to}`);

describe("generateScreens", () => {
  it("一覧・詳細・フォーム・削除の確認と、その間の遷移（本物の部品）を作る", () => {
    let r = {};
    const p = apply(erOnly(), (d) => void (r = generateScreens(d, "Device")));
    expect(r).toEqual({
      list: "devices",
      detail: "deviceDetail",
      form: "deviceForm",
      confirm: "deviceDelete",
    });
    expect(p.entry).toBe("devices");
    expect(p.screens.map((s) => [s.id, s.name, s.kind, s.path])).toEqual([
      ["devices", "機器一覧", "list", "/devices"],
      ["deviceDetail", "機器詳細", "detail", "/devices/:deviceId"],
    ]);
    expect(p.dialogs.map((s) => [s.id, s.name, s.kind])).toEqual([
      ["deviceForm", "機器の編集", "form"],
      ["deviceDelete", "機器の削除", "confirm"],
    ]);
    expect(pairs(p)).toEqual([
      "devices -newButton.click-> deviceForm",
      "devices -editButton.click-> deviceForm",
      "devices -deleteButton.click-> deviceDelete",
      "devices -table.rowClick-> deviceDetail",
      "deviceDetail -editButton.click-> deviceForm",
      "deviceDetail -deleteButton.click-> deviceDelete",
      "deviceDetail -backButton.click-> devices",
      "deviceDelete -ok.click-> devices",
    ]);
    expect(extractTransitions(p).some((t) => t.placeholder)).toBe(false);
    expect(findNode(p.screens[0]!.root, "editButton")!.props).toEqual({
      label: "編集",
      requires: "selection.Device",
    });
    // 検証の問題（エラーも警告も）が無い
    expect(checkProject(p).map(formatIssue)).toEqual([]);
  });

  it("入れ子のエンティティ: 一覧からは作らず、親の詳細の子の一覧から追加・詳細へ", () => {
    const p = apply(erOnly(), (d) => {
      generateScreens(d, "Device");
      generateScreens(d, "Alarm");
    });
    const all = pairs(p);
    expect(all.filter((x) => x.startsWith("alarms "))).toEqual([
      "alarms -editButton.click-> alarmForm",
      "alarms -table.rowClick-> alarmDetail",
    ]);
    expect(all).toContain("deviceDetail -alarmsTable.rowClick-> alarmDetail");
    expect(all).toContain("deviceDetail -addAlarmButton.click-> alarmForm");
    const add = extractTransitions(p).find((t) => t.node === "addAlarmButton")!;
    expect(add.params).toEqual({ deviceId: "{{ params.deviceId }}" });
    // 入れ子の削除の確認は前の画面へ戻る
    expect(
      findNode(p.dialogs.find((d) => d.id === "alarmDelete")!.root, "ok")!.events!.click!.at(-1),
    ).toEqual({
      type: "back",
    });
    expect(checkProject(p).map(formatIssue)).toEqual([]);
  });

  it("子を先に作っても、あとで親の詳細を作ると結ぶ。作るものを選べる。id がぶつかれば番号を付ける", () => {
    const p = apply(erOnly(), (d) => {
      generateScreens(d, "Alarm", { list: false, confirm: false });
      generateScreens(d, "Device", { form: false });
      generateScreens(d, "Device", { detail: false, form: false, confirm: false });
    });
    expect(p.screens.map((s) => s.id)).toEqual([
      "alarmDetail",
      "devices",
      "deviceDetail",
      "devices2",
    ]);
    expect(pairs(p)).toContain("deviceDetail -addAlarmButton.click-> alarmForm");
    expect(pairs(p)).toContain("deviceDetail -alarmsTable.rowClick-> alarmDetail");
    expect(pairs(p).filter((x) => x.includes("deviceForm"))).toEqual([]);
    expect(p.entry).toBe("alarmDetail");
  });
});
