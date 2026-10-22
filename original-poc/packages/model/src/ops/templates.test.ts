import { produce } from "immer";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { extractTransitions } from "../flow.js";
import { loadProject } from "../io.js";
import type { Node, Project } from "../schema.js";
import { checkProject } from "../validate.js";
import { findNode } from "../walk.js";
import { addContainer } from "./containers.js";
import { addTransition, setTrigger } from "./flow.js";
import { applyTemplate, templateConflicts } from "./templates.js";

const apply = (p: Project, recipe: (d: Project) => void) => produce(p, recipe);

/** 題材の ER とデータだけを残したプロジェクト（画面・ダイアログは空）。 */
function erOnly(): Project {
  const r = loadProject(
    readFileSync(new URL("../../../../examples/device-monitor.poc.json", import.meta.url), "utf8"),
  );
  if (!r.success) throw new Error("題材");
  return { ...r.project, entry: undefined, screens: [], dialogs: [], layout: undefined };
}

const errors = (p: Project) => checkProject(p).filter((i) => i.severity === "error");
const ids = (n: Node | undefined) => n?.children?.map((c) => c.id);

describe("applyTemplate", () => {
  it("一覧: タイトル・選択できる表（列は表示用フィールドから）", () => {
    const p = apply(erOnly(), (d) => {
      addContainer(d, "screen", { id: "devices", name: "機器一覧" });
      applyTemplate(d, "devices", { kind: "list", entity: "Device" });
    });
    const s = p.screens[0]!;
    expect(s).toMatchObject({ kind: "list", entity: "Device" });
    expect(s.params).toBeUndefined();
    expect(ids(s.root)).toEqual(["title", "table"]);
    expect(findNode(s.root, "table")!.props).toEqual({
      rows: "{{ data.Device }}",
      entity: "Device",
      selectable: true,
      columns: [
        { header: "名前", value: "{{ row.name }}" },
        { header: "型番", value: "{{ row.model }}" },
        { header: "状態", value: "{{ row.status }}" },
        { header: "IP アドレス", value: "{{ row.ipAddress }}" },
      ],
    });
    expect(errors(p)).toEqual([]);
  });

  it("詳細: 必須の ref パラメータ、null を考慮した式、入れ子の子（配列は表、1 件は項目）", () => {
    const p = apply(erOnly(), (d) => {
      addContainer(d, "screen", { id: "detail" });
      applyTemplate(d, "detail", { kind: "detail", entity: "Device" });
    });
    const s = p.screens[0]!;
    expect(s.params).toEqual({ deviceId: { type: "ref", entity: "Device", required: true } });
    expect(ids(s.root)).toEqual([
      "title",
      "fields",
      "settingsTitle",
      "settingsBox",
      "metricsTitle",
      "metricsTable",
      "alarmsTitle",
      "alarmsTable",
    ]);
    expect(findNode(s.root, "title")!.props!.text).toBe('{{ record?.name ?? "" }}');
    expect(findNode(s.root, "statusText")!.props!.text).toBe('状態: {{ record?.status ?? "" }}');
    expect(findNode(s.root, "alarmsTable")!.props!.rows).toBe("{{ record?.alarms ?? [] }}");
    expect(findNode(s.root, "settings_dhcpText")!.props!.text).toBe(
      'DHCP: {{ record?.settings?.dhcp ? "はい" : "いいえ" }}',
    );
    expect(errors(p)).toEqual([]);
  });

  it("フォーム: 型ごとの入力欄と保存・キャンセル（ダイアログは閉じる、画面は戻る）", () => {
    const p = apply(erOnly(), (d) => {
      addContainer(d, "dialog", { id: "edit", name: "機器の編集" });
      addContainer(d, "screen", { id: "editPage", name: "機器の編集" });
      applyTemplate(d, "edit", { kind: "form", entity: "Device" });
      applyTemplate(d, "editPage", { kind: "form", entity: "Device" });
    });
    const dlg = p.dialogs[0]!;
    expect(dlg.params).toEqual({ deviceId: { type: "ref", entity: "Device" } });
    expect(ids(dlg.root)).toEqual([
      "title",
      "nameInput",
      "modelInput",
      "statusInput",
      "ipAddressInput",
      "firmwareInput",
      "actions",
    ]);
    expect(findNode(dlg.root, "statusInput")).toMatchObject({
      type: "Select",
      props: { value: "{{ draft.status }}", error: "{{ errors.status }}" },
      events: { change: [{ type: "setDraft", field: "status", value: "{{ event.value }}" }] },
    });
    expect(findNode(dlg.root, "save")!.events!.click).toEqual([
      { type: "saveDraft" },
      { type: "closeDialog", result: "ok" },
    ]);
    expect(findNode(p.screens[0]!.root, "save")!.events!.click).toEqual([
      { type: "saveDraft" },
      { type: "back" },
    ]);
    expect(errors(p)).toEqual([]);
  });

  it("入れ子のエンティティのフォームは、親を指す ref パラメータも持つ", () => {
    const p = apply(erOnly(), (d) => {
      addContainer(d, "dialog", { id: "alarmNew" });
      applyTemplate(d, "alarmNew", { kind: "form", entity: "Alarm" });
    });
    expect(p.dialogs[0]!.params).toEqual({
      alarmId: { type: "ref", entity: "Alarm" },
      deviceId: { type: "ref", entity: "Device" },
    });
  });

  it("確認: OK でパラメータのレコードを削除して閉じる", () => {
    const p = apply(erOnly(), (d) => {
      addContainer(d, "dialog", { id: "del" });
      applyTemplate(d, "del", { kind: "confirm", entity: "Device" });
    });
    const root = p.dialogs[0]!.root;
    expect(findNode(root, "message")!.props!.text).toBe(
      '「{{ record?.name ?? "" }}」を削除しますか？機器設定・メトリクス・アラームも削除されます。',
    );
    expect(findNode(root, "ok")!.events!.click).toEqual([
      { type: "deleteRecord", entity: "Device", match: { id: "{{ params.deviceId }}" } },
      { type: "closeDialog", result: "ok" },
    ]);
  });

  it("仮の部品は操作ボタンの並びに残し、仮の表のイベントは一覧の表に移す", () => {
    let k = "";
    const base = apply(erOnly(), (d) => {
      addContainer(d, "screen", { id: "devices" });
      addContainer(d, "screen", { id: "detail" });
      addContainer(d, "screen", { id: "home" });
      addTransition(d, "devices", "home");
      k = addTransition(d, "devices", "detail");
      setTrigger(d, k, { kind: "rowClick", entity: "Device" });
    });
    expect(templateConflicts(base.screens[0]!)).toBe(0);
    const p = apply(base, (d) => applyTemplate(d, "devices", { kind: "list", entity: "Device" }));
    const root = p.screens[0]!.root;
    expect(ids(root)).toEqual(["title", "toolbar", "table"]);
    expect(ids(findNode(root, "toolbar"))).toEqual(["btn1"]);
    expect(findNode(root, "table")!.events!.rowClick).toEqual([{ type: "navigate", to: "detail" }]);
    expect(extractTransitions(p).map((t) => t.key)).toEqual([
      "devices:btn1:click:0",
      "devices:table:rowClick:0",
    ]);
    // テンプレートを当てた後は、仮の部品でない中身があるので数える
    expect(templateConflicts(p.screens[0]!)).toBe(4);
  });
});
