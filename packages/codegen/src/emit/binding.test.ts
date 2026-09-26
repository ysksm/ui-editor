import { describe, expect, it } from "vitest";
import { BindingError, checkExpression, Scope, templateExpr, templateParts } from "./binding.js";

const scope = () => new Scope(["data", "state", "props"]);

describe("templateExpr", () => {
  it.each([
    ["全体が 1 つの式なら値をそのまま使う", "{{ data.devices }}", "(data.devices)"],
    ["前後の空白は無視する", "  {{ props.x }}  ", "(props.x)"],
    ["文字列の中の式はテンプレートリテラル", "{{ props.a }} の設定", "`${props.a} の設定`"],
    ["式が 2 つ", "{{ props.value }} {{ props.unit }}", "`${props.value} ${props.unit}`"],
    ["バインディングがなければ文字列", "ダッシュボード", '"ダッシュボード"'],
    ["` や ${ はエスケープする", "`${x}` {{ props.a }}", "`\\`\\${x}\\` ${props.a}`"],
    ["オブジェクトリテラルも括弧で囲む", "{{ ({ a: 'x' })[props.k] }}", "(({ a: 'x' })[props.k])"],
  ])("%s", (_, template, expected) => {
    expect(templateExpr(template, scope(), "t")).toBe(expected);
  });
});

describe("templateParts", () => {
  it("固定の文字列と式に分ける", () => {
    expect(templateParts("機器: {{ props.name }}（{{ props.id }}）", scope(), "t")).toEqual([
      { text: "機器: " },
      { expr: "props.name" },
      { text: "（" },
      { expr: "props.id" },
      { text: "）" },
    ]);
  });
});

describe("checkExpression", () => {
  it.each([
    "data.devices.find(d => d.id === props.id)?.name ?? '-'",
    "Math.max(...data.metrics.map((m) => m.cpu))",
    "data.alarms.toSorted((a, b) => b.occurredAt.localeCompare(a.occurredAt)).slice(0, 5)",
    "data.devices.reduce((sum, { cpu = 0 }) => sum + cpu, 0)",
    "data.devices.map(function f(d) { const n = d.name; return n; })",
    "({ online: 'オンライン' })[props.status]",
    "`${props.a}-${props.b}`",
    "structuredClone(state.draft ?? null)",
  ])("通る: %s", (expr) => {
    expect(() => checkExpression(expr, scope(), "t")).not.toThrow();
  });

  it.each([
    ["未定義の名前", "device.name", '"device" はここでは参照できません'],
    [
      "アロー関数の外で引数を使う",
      "data.devices.map(d => d.id) && d",
      '"d" はここでは参照できません',
    ],
    ["構文エラー", "data.devices.find(d => ", "式の構文エラー"],
    ["文が 2 つ", "props.a; props.b", "式の構文エラー"],
    ["window などのグローバルは使えない", "window.alert(1)", '"window" はここでは参照できません'],
  ])("%s はエラー", (_, expr, message) => {
    expect(() => checkExpression(expr, scope(), 'screens.x のノード "y" の props.text')).toThrow(
      message,
    );
  });

  it("エラーには場所と式が入る", () => {
    const error = (() => {
      try {
        checkExpression("foo", scope(), 'screens.x のノード "y" の props.text');
      } catch (e) {
        return e;
      }
    })();
    expect(error).toBeInstanceOf(BindingError);
    expect((error as BindingError).message).toBe(
      'screens.x のノード "y" の props.text: "foo" はここでは参照できません\n  式: foo',
    );
  });

  it("メンバー名やオブジェクトのキーは名前として扱わない", () => {
    expect(() => checkExpression("({ device: props.a.device })", scope(), "t")).not.toThrow();
  });

  it("参照した名前をスコープに記録する", () => {
    const root = scope();
    const inner = root.child(["device", "index"]);
    checkExpression("device.name + data.x", inner, "t");
    expect([...inner.used]).toEqual(["device"]);
    expect([...root.used]).toEqual(["data"]);
  });
});
