import { describe, expect, it } from "vitest";
import { smallProject } from "./fixture.test-util.js";
import type { Issue, IssuePath, Severity } from "./issues.js";
import type { Action, Node, Project } from "./schema.js";
import { checkProject, validateProject } from "./validate.js";

const issue = (severity: Severity, path: IssuePath, message?: string | RegExp) =>
  expect.objectContaining({
    severity,
    path,
    ...(message === undefined
      ? {}
      : { message: typeof message === "string" ? message : expect.stringMatching(message) }),
  }) as unknown as Issue;

/** 小さな題材を書き換えて検証する。 */
function check(edit: (p: Project) => void): Issue[] {
  const p = smallProject();
  edit(p);
  return checkProject(p);
}

const page = (p: Project, i: number): Node => p.screens[i]!.root!;
const firstAction = (node: Node, event: string): Action => node.events![event]![0]!;

describe("validateProject", () => {
  it("小さな題材には問題が無い", () => {
    const r = validateProject(smallProject());
    expect(r).toEqual({ success: true, project: smallProject(), issues: [] });
  });

  it("形が壊れていれば読み込まない", () => {
    expect(validateProject({ schemaVersion: "poc-0" })).toMatchObject({ success: false });
  });

  it("存在しない画面への遷移を、場所付きのエラーにする", () => {
    const issues = check((p) => {
      const a = firstAction(page(p, 0).children![0]!, "rowClick");
      if (a.type === "navigate") a.to = "deviceDetial";
    });
    expect(issues).toEqual([
      {
        severity: "error",
        path: ["screens", 0, "root", "children", 0, "events", "rowClick", 0, "to"],
        message: '画面 "deviceDetial" がありません',
      },
    ]);
  });
});

describe("ER", () => {
  it("主キー・表示用フィールド・id の重複", () => {
    const issues = check((p) => {
      const device = p.entities[0]!;
      device.primaryKey = "code";
      device.displayField = "label";
      device.fields.push({ id: "name", type: "string" });
      p.entities.push({ ...p.entities[1]!, fields: [] });
    });
    expect(issues).toEqual(
      expect.arrayContaining([
        issue("error", ["entities", 0, "fields", 4, "id"], /フィールド id "name" が重複/),
        issue("error", ["entities", 0, "fields", 0, "type"], "type: id は主キーにだけ使えます"),
        issue("error", ["entities", 0, "primaryKey"], 'フィールド "code" がありません'),
        issue("error", ["entities", 0, "displayField"], 'フィールド "label" がありません'),
        issue("error", ["entities", 2, "id"], /エンティティ id "Alarm" が重複/),
      ]),
    );
  });

  it("フィールドの型ごとの指定", () => {
    const issues = check((p) => {
      const f = p.entities[0]!.fields;
      f.push({ id: "kind", type: "enum" });
      f.push({ id: "ownerId", type: "ref" });
      f.push({ id: "siteId", type: "ref", entity: "Site" });
      f.push({ id: "port", type: "number", min: 10, max: 1, values: ["x"] });
      f.push({ id: "online", type: "boolean", default: "yes" });
      f.push({ id: "mail", type: "string", format: "datetime" });
    });
    expect(issues).toEqual([
      issue("error", ["entities", 0, "fields", 4, "values"], "enum には値（values）が必要です"),
      issue("error", ["entities", 0, "fields", 5, "entity"], /相手のエンティティ/),
      issue("error", ["entities", 0, "fields", 6, "entity"], 'エンティティ "Site" がありません'),
      issue("warning", ["entities", 0, "fields", 7, "values"], /使われません/),
      issue("error", ["entities", 0, "fields", 7, "min"], /min が max より大きく/),
      issue("error", ["entities", 0, "fields", 8, "default"], /true \/ false/),
      issue("warning", ["entities", 0, "fields", 9, "format"], /書式 datetime は使えません/),
    ]);
  });

  it("入れ子の親は 1 つだけで、循環しない", () => {
    const issues = check((p) => {
      p.entities.push({
        id: "Site",
        name: "拠点",
        primaryKey: "id",
        fields: [
          { id: "id", type: "id" },
          { id: "alarms", type: "children", entity: "Alarm" },
        ],
      });
      p.entities[1]!.fields.push({ id: "devices", type: "children", entity: "Device" });
    });
    expect(issues).toEqual(
      expect.arrayContaining([
        issue(
          "error",
          ["entities", 2, "fields", 1, "entity"],
          /既に entities\[0\]\.fields\[3\] の入れ子/,
        ),
        issue("error", ["entities", 1, "fields", 3], /入れ子が循環しています/),
      ]),
    );
  });
});

describe("データ（入れ子）", () => {
  it("入れ子の中まで型・必須・列挙値・主キーを調べる", () => {
    const issues = check((p) => {
      const dev = p.data.Device![0]!;
      dev.status = "broken";
      dev.color = "red";
      p.data.Device!.push({
        id: "dev-002",
        name: "",
        alarms: [{ id: "alm-001", message: 42 }, { message: "主キーなし" }],
      });
    });
    expect(issues).toEqual([
      issue("error", ["data", "Device", 0, "color"], 'Device にフィールド "color" はありません'),
      issue("error", ["data", "Device", 0, "status"], "online / offline のどれかにしてください"),
      issue("error", ["data", "Device", 1, "name"], "必須の項目です"),
      issue(
        "error",
        ["data", "Device", 1, "alarms", 0, "id"],
        /主キー "alm-001" が重複.*data\.Device\[0\]\.alarms\[0\]\.id/,
      ),
      issue("error", ["data", "Device", 1, "alarms", 0, "message"], "文字列ではありません"),
      issue("error", ["data", "Device", 1, "alarms", 1, "id"], "主キーがありません"),
    ]);
  });

  it("入れ子のエンティティは data の直下に置けない・子の形", () => {
    const issues = check((p) => {
      p.data.Alarm = [];
      p.data.Site = [];
      p.data.Device![0]!.alarms = { id: "x" };
    });
    expect(issues).toEqual([
      issue("error", ["data", "Device", 0, "alarms"], "子のレコードの配列ではありません"),
      issue("error", ["data", "Alarm"], /Device\.alarms の入れ子なので、data の直下には置けません/),
      issue("error", ["data", "Site"], 'エンティティ "Site" がありません'),
    ]);
  });

  it("参照（ref）の参照先が実在するか、書式は警告", () => {
    const issues = check((p) => {
      p.entities[1]!.fields.push({
        id: "deviceId",
        type: "ref",
        entity: "Device",
        onDelete: "cascade",
      });
      p.entities[0]!.fields.push({ id: "ip", type: "string", format: "ipv4" });
      const dev = p.data.Device![0]!;
      dev.ip = "300.1.1.1";
      (dev.alarms as Record<string, unknown>[]).push(
        { id: "alm-002", deviceId: "dev-001" },
        { id: "alm-003", deviceId: "dev-999" },
      );
    });
    expect(issues).toEqual([
      issue("warning", ["data", "Device", 0, "ip"], "書式 ipv4 に合っていません"),
      issue(
        "error",
        ["data", "Device", 0, "alarms", 2, "deviceId"],
        '参照先の Device "dev-999" がありません',
      ),
    ]);
  });
});

describe("state", () => {
  it("selection は予約語", () => {
    expect(check((p) => (p.state.selection = {}))).toEqual([
      issue("error", ["state", "selection"], /予約語/),
    ]);
  });
});

describe("画面・ダイアログ・ノード", () => {
  it("id・entry・path・entity・params", () => {
    const issues = check((p) => {
      p.entry = "deviceDelete";
      p.dialogs[0]!.id = "devices";
      p.screens[0]!.path = "/devices/:deviceId";
      p.screens[1]!.path = "/devices/:deviceId";
      p.screens[0]!.entity = "Devise";
      p.dialogs.push({ id: "memo", name: "メモ", kind: "form", params: { x: { type: "ref" } } });
    });
    expect(issues).toEqual(
      expect.arrayContaining([
        issue("error", ["dialogs", 0, "id"], /id "devices" が重複/),
        issue("error", ["entry"], '画面 "deviceDelete" がありません'),
        issue("error", ["screens", 1, "path"], /screens\[0\] と重複/),
        issue(
          "error",
          ["screens", 0, "path"],
          'path のパラメータ "deviceId" が params にありません',
        ),
        issue("error", ["screens", 0, "entity"], 'エンティティ "Devise" がありません'),
        issue("warning", ["dialogs", 1, "kind"], /エンティティ（entity）が要ります/),
        issue("error", ["dialogs", 1, "params", "x", "entity"], /entity が必要/),
      ]),
    );
  });

  it("ノードの id・type・イベント・requires・表・式", () => {
    const issues = check((p) => {
      const root = page(p, 0);
      root.children!.push(
        { id: "table", type: "Text", props: { text: "{{ data.Device.length " } },
        { id: "chart", type: "Chart" },
        {
          id: "go",
          type: "Button",
          props: { requires: "selection.Devise" },
          events: { change: [] },
        },
        { id: "list", type: "Table", props: { entity: "Alarms", columns: "name" } },
      );
    });
    expect(issues).toEqual([
      issue("error", ["screens", 0, "root", "children", 1, "id"], /ノード id "table" が重複/),
      issue(
        "error",
        ["screens", 0, "root", "children", 1, "props", "text"],
        "`{{` が閉じられていません",
      ),
      issue("error", ["screens", 0, "root", "children", 2, "type"], /組み込みにありません/),
      issue(
        "warning",
        ["screens", 0, "root", "children", 3, "events", "change"],
        /Button はイベント "change" を発火しません/,
      ),
      issue(
        "error",
        ["screens", 0, "root", "children", 3, "props", "requires"],
        'エンティティ "Devise" がありません',
      ),
      issue(
        "error",
        ["screens", 0, "root", "children", 4, "props", "entity"],
        'エンティティ "Alarms" がありません',
      ),
      issue("error", ["screens", 0, "root", "children", 4, "props", "columns"], /列/),
    ]);
  });

  it("式の中の存在しないエンティティは警告", () => {
    const issues = check((p) => {
      page(p, 0).children![0]!.props!.rows = "{{ data.Devices }}";
    });
    expect(issues).toEqual([
      issue(
        "warning",
        ["screens", 0, "root", "children", 0, "props", "rows"],
        /エンティティ "Devices" がありません/,
      ),
    ]);
  });
});

describe("アクション", () => {
  it("遷移先の種類とパラメータ", () => {
    const issues = check((p) => {
      const events = page(p, 0).children![0]!.events!;
      events.rowClick = [
        { type: "navigate", to: "deviceDelete" },
        { type: "openDialog", dialog: "deviceDetail" },
        { type: "navigate", to: "deviceDetail", params: { id: "x" } },
      ];
    });
    expect(issues).toEqual([
      issue(
        "error",
        ["screens", 0, "root", "children", 0, "events", "rowClick", 0, "to"],
        /ダイアログです（openDialog/,
      ),
      issue(
        "error",
        ["screens", 0, "root", "children", 0, "events", "rowClick", 1, "dialog"],
        /画面です（navigate/,
      ),
      issue(
        "error",
        ["screens", 0, "root", "children", 0, "events", "rowClick", 2, "params", "id"],
        /パラメータ "id" はありません/,
      ),
      issue(
        "warning",
        ["screens", 0, "root", "children", 0, "events", "rowClick", 2, "params"],
        /必須のパラメータ "deviceId"/,
      ),
    ]);
  });

  it("onClose の中も、その場所で検証する", () => {
    const issues = check((p) => {
      const open = firstAction(page(p, 1).children![0]!, "click");
      if (open.type === "openDialog") open.onClose = { ok: [{ type: "navigate", to: "nowhere" }] };
    });
    expect(issues).toEqual([
      issue(
        "error",
        ["screens", 1, "root", "children", 0, "events", "click", 0, "onClose", "ok", 0, "to"],
        /"nowhere" がありません/,
      ),
    ]);
  });

  it("state・データ操作・下書き", () => {
    const issues = check((p) => {
      p.screens[0]!.events = {
        mount: [
          { type: "setState", path: "filter.x", value: 1 },
          { type: "setState", path: "selection.Device", value: null },
          { type: "select", entity: "Alarm", id: "{{ event.row.id }}" },
          { type: "createRecord", entity: "Alarm", values: { message: "x", level: "warn" } },
          { type: "createRecord", entity: "Device", values: { alarms: [] }, parent: "x" },
          { type: "updateRecord", entity: "Device", match: { id: "x" }, set: { nam: "y" } },
          { type: "deleteRecord", entity: "Gadget", match: {} },
          { type: "setDraft", field: "name", value: "{{ event.value }}" },
          { type: "closeDialog" },
        ],
      };
    });
    const at = (i: number, ...rest: IssuePath): IssuePath => [
      "screens",
      0,
      "events",
      "mount",
      i,
      ...rest,
    ];
    expect(issues).toEqual([
      issue("error", at(0, "path"), 'state に "filter" がありません'),
      issue("error", at(1, "path"), /select アクション/),
      issue("error", at(3, "values", "level"), 'Alarm にフィールド "level" はありません'),
      issue("error", at(3), /Device の入れ子なので parent/),
      issue("error", at(4, "values", "alarms"), /children のフィールドはここでは指定できません/),
      issue("warning", at(4, "parent"), /入れ子でないエンティティには parent は使われません/),
      issue("error", at(5, "set", "nam"), 'Device にフィールド "nam" はありません'),
      issue("error", at(6, "entity"), 'エンティティ "Gadget" がありません'),
      issue("warning", at(7), /setDraft はフォーム/),
      issue("warning", at(8), /画面の中の closeDialog/),
    ]);
  });
});

describe("配置情報", () => {
  it("存在しない id の配置は警告", () => {
    const issues = check((p) => {
      p.layout = { flow: { gone: { x: 1, y: 2 } }, er: { Gone: { x: 0, y: 0 } } };
    });
    expect(issues).toEqual([
      issue("warning", ["layout", "flow", "gone"], /"gone" がありません/),
      issue("warning", ["layout", "er", "Gone"], /"Gone" がありません/),
    ]);
  });
});
