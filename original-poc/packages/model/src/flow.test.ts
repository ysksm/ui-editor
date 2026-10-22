import { produce } from "immer";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { smallProject } from "./fixture.test-util.js";
import { extractTransitions, findTransition } from "./flow.js";
import { loadProject } from "./io.js";
import { addContainer } from "./ops/containers.js";
import { addTransition, deleteTransition } from "./ops/flow.js";
import type { Project } from "./schema.js";
import { checkProject } from "./validate.js";

const apply = (p: Project, recipe: (d: Project) => void) => produce(p, recipe);

describe("extractTransitions", () => {
  it("ノードのイベント・onClose の中の navigate / openDialog を遷移にする", () => {
    const ts = extractTransitions(smallProject());
    expect(ts.map((t) => [t.key, t.from, t.to, t.kind, t.event, t.placeholder, t.onClose])).toEqual(
      [
        [
          "devices:table:rowClick:0",
          "devices",
          "deviceDetail",
          "navigate",
          "rowClick",
          false,
          undefined,
        ],
        [
          "deviceDetail:btn1:click:0",
          "deviceDetail",
          "deviceDelete",
          "openDialog",
          "click",
          true,
          undefined,
        ],
        [
          "deviceDetail:btn1:click:0/onClose/ok/0",
          "deviceDetail",
          "devices",
          "navigate",
          "click",
          true,
          { dialog: "deviceDelete", result: "ok" },
        ],
      ],
    );
    expect(ts[1]!.label).toBe("削除の確認へ");
    expect(findTransition(smallProject(), "devices:table:rowClick:0")?.params).toEqual({
      deviceId: "{{ event.row.id }}",
    });
  });

  it("題材の遷移（ダイアログからの navigate、画面の mount も）", () => {
    const text = readFileSync(
      new URL("../../../examples/device-monitor.poc.json", import.meta.url),
      "utf8",
    );
    const r = loadProject(text);
    if (!r.success) throw new Error("題材");
    const pairs = extractTransitions(r.project).map((t) => `${t.from}→${t.to}`);
    expect(pairs).toEqual([
      "dashboard→devices",
      "devices→deviceEdit",
      "devices→dashboard",
      "devices→deviceDetail",
      "deviceDetail→deviceDelete",
      "deviceDetail→devices",
      "deviceDelete→devices",
    ]);
  });
});

describe("addTransition / deleteTransition", () => {
  it("線を引くと、遷移元に仮のボタンを置く（中身が無ければ仮の Box も）", () => {
    let key = "";
    const p = apply(smallProject(), (d) => {
      addContainer(d, "screen", { id: "home", name: "ホーム" });
      key = addTransition(d, "home", "devices");
      addTransition(d, "home", "deviceDelete");
    });
    expect(key).toBe("home:btn1:click:0");
    expect(p.screens[2]!.root).toEqual({
      id: "page",
      type: "Box",
      placeholder: true,
      props: { direction: "column", gap: 8 },
      children: [
        {
          id: "btn1",
          type: "Button",
          placeholder: true,
          props: { label: "機器一覧へ" },
          events: { click: [{ type: "navigate", to: "devices" }] },
        },
        {
          id: "btn2",
          type: "Button",
          placeholder: true,
          props: { label: "削除の確認を開く" },
          events: { click: [{ type: "openDialog", dialog: "deviceDelete" }] },
        },
      ],
    });
    // 必須のパラメータ（deviceId）が渡されていない警告だけ
    expect(checkProject(p).map((i) => i.severity)).toEqual(["warning"]);
  });

  it("消すと空になった仮のボタンと仮の Box も消える。仮でない部品は残る", () => {
    let k1 = "";
    const p = apply(smallProject(), (d) => {
      addContainer(d, "screen", { id: "home" });
      k1 = addTransition(d, "home", "devices");
    });
    const q = apply(p, (d) => deleteTransition(d, k1));
    expect(q.screens[2]!.root).toBeUndefined();
    const r = apply(smallProject(), (d) => deleteTransition(d, "devices:table:rowClick:0"));
    expect(r.screens[0]!.root!.children![0]!.events).toBeUndefined();
    expect(r.screens[0]!.root!.children).toHaveLength(1);
  });

  it("onClose の中の遷移だけを消すと onClose も消える", () => {
    const p = apply(smallProject(), (d) =>
      deleteTransition(d, "deviceDetail:btn1:click:0/onClose/ok/0"),
    );
    expect(p.screens[1]!.root!.children![0]!.events!.click).toEqual([
      { type: "openDialog", dialog: "deviceDelete", params: { deviceId: "{{ params.deviceId }}" } },
    ]);
  });

  it("1 つの部品だけの root は仮の Box で包む", () => {
    const p = apply(smallProject(), (d) => {
      d.dialogs[0]!.root = { id: "msg", type: "Text", props: { text: "x" } };
      addTransition(d, "deviceDelete", "devices");
    });
    expect(p.dialogs[0]!.root).toMatchObject({ id: "page", type: "Box", placeholder: true });
    expect(p.dialogs[0]!.root!.children!.map((n) => n.id)).toEqual(["msg", "btn1"]);
  });
});
