import { produce } from "immer";
import { describe, expect, it } from "vitest";
import { smallProject } from "../fixture.test-util.js";
import { serializeProject } from "../io.js";
import type { Project } from "../schema.js";
import { checkProject } from "../validate.js";
import {
  addEntity,
  addField,
  addRelation,
  deleteEntity,
  deleteField,
  moveField,
  relationDataLoss,
  relationProblem,
  renameEntityId,
  renameField,
  setEntityPosition,
  updateEntity,
  updateField,
} from "./er.js";
import { pluralize, uniqueId } from "./ids.js";

/** 編集操作を immer のレシピとして適用する（エディタと同じ使い方）。 */
const apply = (p: Project, recipe: (d: Project) => void) => produce(p, recipe);

describe("id の補助", () => {
  it("uniqueId / pluralize", () => {
    expect(uniqueId("alarms", ["alarms", "alarms2"])).toBe("alarms3");
    expect(uniqueId("x", [])).toBe("x");
    expect(["Alarm", "Category", "Box", "Status"].map(pluralize)).toEqual([
      "Alarms",
      "Categories",
      "Boxes",
      "Statuses",
    ]);
  });
});

describe("エンティティ", () => {
  it("追加すると主キーだけを持つエンティティができる", () => {
    let id = "";
    const p = apply(
      smallProject(),
      (d) => void (id = addEntity(d, { position: { x: 10.4, y: 20 } })),
    );
    expect(id).toBe("Entity1");
    expect(p.entities.at(-1)).toEqual({
      id: "Entity1",
      name: "エンティティ1",
      primaryKey: "id",
      fields: [{ id: "id", type: "id" }],
    });
    expect(p.layout?.er).toEqual({ Entity1: { x: 10, y: 20 } });
    expect(checkProject(p)).toEqual([]);
    expect(() => apply(p, (d) => void addEntity(d, { id: "Device" }))).toThrow("既にあります");
    expect(() => apply(p, (d) => void addEntity(d, { id: "device" }))).toThrow("PascalCase");
  });

  it("id を変えると参照も書き換える", () => {
    const base = apply(smallProject(), (d) => {
      d.entities.push({
        id: "Ticket",
        name: "チケット",
        primaryKey: "id",
        fields: [
          { id: "id", type: "id" },
          { id: "deviceId", type: "ref", entity: "Device" },
        ],
      });
      d.screens[0]!.root!.children!.push({
        id: "edit",
        type: "Button",
        props: { requires: "selection.Device" },
        events: { click: [{ type: "select", entity: "Device", id: null }] },
      });
      setEntityPosition(d, "Device", { x: 1, y: 2 });
    });
    const p = apply(base, (d) => renameEntityId(d, "Device", "Machine"));
    expect(p.entities[0]!.id).toBe("Machine");
    expect(p.entities[2]!.fields[1]!.entity).toBe("Machine");
    expect(Object.keys(p.data)).toEqual(["Machine"]);
    expect(p.screens[0]!.entity).toBe("Machine");
    expect(p.screens[1]!.params!.deviceId!.entity).toBe("Machine");
    const nodes = p.screens[0]!.root!.children!;
    expect(nodes[0]!.props!.entity).toBe("Machine");
    expect(nodes[1]!.props!.requires).toBe("selection.Machine");
    expect(nodes[1]!.events!.click![0]).toMatchObject({ type: "select", entity: "Machine" });
    expect(p.dialogs[0]!.root!.children![0]!.events!.click![0]).toMatchObject({
      entity: "Machine",
    });
    expect(p.layout?.er).toEqual({ Machine: { x: 1, y: 2 } });
    // 式の中（data.Device）は書き換えないので警告が出る
    expect(checkProject(p).map((i) => i.severity)).toEqual(["warning"]);
  });

  it("消すと、それを指すフィールドとデータも消える", () => {
    const p = apply(smallProject(), (d) => deleteEntity(d, "Alarm"));
    expect(p.entities.map((e) => e.id)).toEqual(["Device"]);
    expect(p.entities[0]!.fields.map((f) => f.id)).toEqual(["id", "name", "status"]);
    expect(p.data.Device![0]).toEqual({ id: "dev-001", name: "ルーター A", status: "online" });
    const q = apply(smallProject(), (d) => deleteEntity(d, "Device"));
    expect(q.data).toEqual({});
  });

  it("名前と表示用フィールドを変える", () => {
    const p = apply(smallProject(), (d) =>
      updateEntity(d, "Alarm", { name: "警報", displayField: undefined }),
    );
    expect(p.entities[1]).toMatchObject({ name: "警報" });
    expect(p.entities[1]!.displayField).toBeUndefined();
  });
});

describe("フィールド", () => {
  it("追加・並べ替え・削除（データの値も消える）", () => {
    let id = "";
    const p = apply(smallProject(), (d) => {
      id = addField(d, "Device", { name: "設置場所" });
      moveField(d, "Device", id, 1);
    });
    expect(p.entities[0]!.fields.map((f) => f.id)).toEqual([
      "id",
      "field1",
      "name",
      "status",
      "alarms",
    ]);
    const q = apply(p, (d) => deleteField(d, "Device", "status"));
    expect(q.data.Device![0]!.status).toBeUndefined();
    expect(() => apply(p, (d) => deleteField(d, "Device", "id"))).toThrow("主キーは消せません");
  });

  it("型を変えると、その型で使わないキーを消す。children をやめると入れ子のデータも消す", () => {
    const p = apply(smallProject(), (d) => {
      updateField(d, "Device", "status", { type: "string", format: "email" });
      updateField(d, "Device", "alarms", { type: "string" });
    });
    expect(p.entities[0]!.fields[2]).toEqual({ id: "status", type: "string", format: "email" });
    expect(p.entities[0]!.fields[3]).toEqual({ id: "alarms", type: "string" });
    expect(p.data.Device![0]!.alarms).toBeUndefined();
    const q = apply(smallProject(), (d) => updateField(d, "Device", "status", { type: "number" }));
    expect(q.entities[0]!.fields[2]).toEqual({ id: "status", type: "number" });
  });

  it("id を変えると、データのキーとアクションも書き換える", () => {
    const base = apply(smallProject(), (d) => {
      d.dialogs.push({
        id: "deviceForm",
        name: "フォーム",
        kind: "form",
        entity: "Device",
        root: {
          id: "f",
          type: "TextInput",
          events: { change: [{ type: "setDraft", field: "name", value: "{{ event.value }}" }] },
        },
      });
      d.screens[0]!.events = {
        mount: [
          { type: "createRecord", entity: "Device", values: { name: "x" } },
          { type: "updateRecord", entity: "Device", match: { name: "x" }, set: { name: "y" } },
        ],
      };
      d.entities[0]!.displayField = "name";
    });
    const p = apply(base, (d) => renameField(d, "Device", "name", "title"));
    expect(p.entities[0]!.displayField).toBe("title");
    expect(p.data.Device![0]).toMatchObject({ title: "ルーター A" });
    expect(p.data.Device![0]!.name).toBeUndefined();
    expect(p.screens[0]!.events!.mount).toEqual([
      { type: "createRecord", entity: "Device", values: { title: "x" } },
      { type: "updateRecord", entity: "Device", match: { title: "x" }, set: { title: "y" } },
    ]);
    expect(p.dialogs[1]!.root!.events!.change![0]).toMatchObject({ field: "title" });
    // 主キーの id を変えても主キーが追いかける
    const q = apply(p, (d) => renameField(d, "Alarm", "id", "alarmId"));
    expect(q.entities[1]!.primaryKey).toBe("alarmId");
    expect((q.data.Device![0]!.alarms as Record<string, unknown>[])[0]).toMatchObject({
      alarmId: "alm-001",
    });
    expect(serializeProject(q)).toContain('"alarmId": "alm-001"');
  });
});

describe("関係", () => {
  const withEntities = (...ids: string[]) =>
    apply(smallProject(), (d) => {
      for (const id of ids) addEntity(d, { id });
    });

  it("1 対多は親に children（複数形）、1 対 1 は cardinality: one、多対 1 は ref を足す", () => {
    const p = apply(withEntities("Metric", "Settings", "Site"), (d) => {
      addRelation(d, "Device", "Metric", "one-to-many");
      addRelation(d, "Device", "Settings", "one-to-one");
      addRelation(d, "Device", "Site", "many-to-one");
    });
    expect(p.entities[0]!.fields.slice(4)).toEqual([
      { id: "metrics", name: "Metric", type: "children", entity: "Metric" },
      {
        id: "settings",
        name: "Settings",
        type: "children",
        entity: "Settings",
        cardinality: "one",
      },
      { id: "siteId", name: "Site", type: "ref", entity: "Site", onDelete: "restrict" },
    ]);
  });

  it("入れ子にすると、子の data の直下のレコードは消える", () => {
    const p = apply(withEntities("Site"), (d) => {
      d.data.Site = [{ id: "s-1" }];
    });
    expect(relationDataLoss(p, "Site", "one-to-many")).toBe(1);
    expect(relationDataLoss(p, "Site", "many-to-one")).toBe(0);
    const q = apply(p, (d) => void addRelation(d, "Device", "Site", "one-to-many"));
    expect(q.data.Site).toBeUndefined();
  });

  it("入れ子の親は 1 つ、循環・自分自身は不可。参照は自由", () => {
    const p = withEntities("Site");
    expect(relationProblem(p, "Site", "Alarm", "one-to-many")).toMatch(/既に Device の入れ子/);
    expect(relationProblem(p, "Alarm", "Device", "one-to-many")).toMatch(/循環/);
    expect(relationProblem(p, "Site", "Site", "one-to-one")).toMatch(/自分自身/);
    expect(relationProblem(p, "Alarm", "Alarm", "many-to-one")).toBeUndefined();
    expect(relationProblem(p, "Site", "Nope", "many-to-one")).toMatch(/ありません/);
    expect(() => apply(p, (d) => void addRelation(d, "Site", "Alarm", "one-to-many"))).toThrow();
  });
});
