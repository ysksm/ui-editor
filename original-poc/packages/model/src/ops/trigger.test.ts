import { produce } from "immer";
import { describe, expect, it } from "vitest";
import { smallProject } from "../fixture.test-util.js";
import { extractTransitions, findTransition } from "../flow.js";
import type { Project } from "../schema.js";
import { checkProject } from "../validate.js";
import { addContainer } from "./containers.js";
import {
  addTransition,
  retargetTransition,
  setTransitionActions,
  setTransitionParams,
  setTrigger,
  triggerKind,
} from "./flow.js";

const apply = (p: Project, recipe: (d: Project) => void) => produce(p, recipe);

/** 一覧 home（中身なし）→ 詳細 deviceDetail の遷移（仮のボタン）を持つ題材。 */
function withHome(): { p: Project; key: string } {
  let key = "";
  const p = apply(smallProject(), (d) => {
    addContainer(d, "screen", { id: "home", name: "ホーム" });
    key = addTransition(d, "home", "deviceDetail");
  });
  return { p, key };
}

describe("setTrigger", () => {
  it("T2: 行クリックにすると、仮の表を置いてアクションを移し、空になった仮のボタンを消す。パラメータも埋める", () => {
    const { p, key } = withHome();
    let next = "";
    const q = apply(
      p,
      (d) => void (next = setTrigger(d, key, { kind: "rowClick", entity: "Device" })),
    );
    expect(next).toBe("home:table:rowClick:0");
    expect(q.screens[2]!.root!.children).toEqual([
      {
        id: "table",
        type: "Table",
        placeholder: true,
        props: {
          rows: "{{ data.Device }}",
          entity: "Device",
          columns: [
            { header: "名前", value: "{{ row.name }}" },
            { header: "status", value: "{{ row.status }}" },
          ],
        },
        events: {
          rowClick: [
            { type: "navigate", to: "deviceDetail", params: { deviceId: "{{ event.row.id }}" } },
          ],
        },
      },
    ]);
    expect(triggerKind(q, findTransition(q, next)!)).toBe("rowClick");
    expect(checkProject(q).filter((i) => i.severity === "error")).toEqual([]);
  });

  it("T2: 既にある表（仮でない）に移す", () => {
    let next = "";
    const p = apply(smallProject(), (d) => {
      const k = addTransition(d, "devices", "deviceDelete");
      next = setTrigger(d, k, { kind: "rowClick", node: "table" });
    });
    expect(next).toBe("devices:table:rowClick:1");
    expect(p.screens[0]!.root!.children!.map((n) => n.id)).toEqual(["table"]);
    expect(p.screens[0]!.root!.children![0]!.events!.rowClick).toEqual([
      { type: "navigate", to: "deviceDetail", params: { deviceId: "{{ event.row.id }}" } },
      { type: "openDialog", dialog: "deviceDelete", params: { deviceId: "{{ event.row.id }}" } },
    ]);
  });

  it("T3: 選択＋ボタン。表を選択できるようにし、ボタンに requires、パラメータは選択から", () => {
    const { p, key } = withHome();
    let next = "";
    const q = apply(
      p,
      (d) => void (next = setTrigger(d, key, { kind: "selectButton", entity: "Device" })),
    );
    const [table, button] = q.screens[2]!.root!.children!;
    expect(table).toMatchObject({ type: "Table", props: { entity: "Device", selectable: true } });
    expect(button).toMatchObject({
      id: "btn1",
      type: "Button",
      props: { label: "機器詳細へ", requires: "selection.Device" },
      events: {
        click: [
          {
            type: "navigate",
            to: "deviceDetail",
            params: { deviceId: "{{ state.selection.Device?.id }}" },
          },
        ],
      },
    });
    expect(next).toBe("home:btn1:click:0");
    expect(triggerKind(q, findTransition(q, next)!)).toBe("selectButton");
    // T1 に戻すと仮のボタンの requires を外す
    const r = apply(q, (d) => void setTrigger(d, next, { kind: "button", node: "btn1" }));
    expect(r.screens[2]!.root!.children![1]!.props).toEqual({ label: "機器詳細へ" });
  });

  it("T5: 画面を開いたとき。付随アクションごと移す", () => {
    const { p, key } = withHome();
    const q = apply(p, (d) => {
      setTransitionActions(d, key, [
        { type: "setState", path: "keyword", value: "" },
        { type: "navigate", to: "deviceDetail" },
      ]);
    });
    let next = "";
    const r = apply(
      q,
      (d) => void (next = setTrigger(d, key.replace(/:0$/, ":1"), { kind: "mount" })),
    );
    expect(next).toBe("home::mount:1");
    expect(r.screens[2]!.events).toEqual({
      mount: [
        { type: "setState", path: "keyword", value: "" },
        { type: "navigate", to: "deviceDetail" },
      ],
    });
    expect(r.screens[2]!.root).toBeUndefined();
    expect(() =>
      apply(
        smallProject(),
        (d) => void setTrigger(d, "deviceDetail:btn1:click:0/onClose/ok/0", { kind: "mount" }),
      ),
    ).toThrow(/onClose/);
  });
});

describe("遷移先・渡す値・アクション列", () => {
  it("遷移先を変えると、画面とダイアログで navigate / openDialog を入れ替える", () => {
    const { p, key } = withHome();
    const q = apply(p, (d) => {
      setTransitionParams(d, key, { deviceId: "dev-001" });
      retargetTransition(d, key, "deviceDelete");
    });
    expect(findTransition(q, key)).toMatchObject({
      kind: "openDialog",
      to: "deviceDelete",
      params: { deviceId: "dev-001" },
    });
    const r = apply(q, (d) => setTransitionParams(d, key, {}));
    expect(findTransition(r, key)!.params).toBeUndefined();
  });

  it("アクション列を置き換えると、遷移の新しい位置の key を返す", () => {
    const { p, key } = withHome();
    let next: string | undefined;
    const q = apply(p, (d) => {
      next = setTransitionActions(d, key, [
        { type: "select", entity: "Device", id: null },
        { type: "navigate", to: "deviceDetail" },
      ]);
    });
    expect(next).toBe("home:btn1:click:1");
    expect(
      extractTransitions(q)
        .filter((t) => t.from === "home")
        .map((t) => t.key),
    ).toEqual([next]);
    let gone: string | undefined = "x";
    const r = apply(q, (d) => void (gone = setTransitionActions(d, next!, [])));
    expect(gone).toBeUndefined();
    expect(r.screens[2]!.root).toBeUndefined();
  });
});
