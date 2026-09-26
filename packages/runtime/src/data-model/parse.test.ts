import { describe, expect, it } from "vitest";
import { exampleProject } from "../example.test-util.js";
import { isModelDecl, parseDataModel, parseTypeExpression } from "./parse.js";
import { formatType, printDataModel } from "./print.js";

describe("parseDataModel", () => {
  it("lists the 4 models of the example project", () => {
    const { declarations, diagnostics } = parseDataModel(exampleProject().dataModel.source);
    expect(diagnostics).toEqual([]);
    expect(declarations.filter(isModelDecl).map((d) => d.name)).toEqual([
      "Device",
      "DeviceSettings",
      "Metric",
      "Alarm",
    ]);
    expect(declarations.filter((d) => !isModelDecl(d)).map((d) => d.name)).toEqual([
      "DeviceStatus",
    ]);
  });

  it("converts fields to name / type / required", () => {
    const { declarations } = parseDataModel(exampleProject().dataModel.source);
    const byName = Object.fromEntries(declarations.map((d) => [d.name, d]));

    const device = byName["Device"]?.type;
    expect(
      device?.kind === "object" && device.fields.map((f) => [f.name, formatType(f.type)]),
    ).toEqual([
      ["id", "string"],
      ["name", "string"],
      ["model", "string"],
      ["status", "DeviceStatus"],
      ["ipAddress", "string"],
      ["firmware", "string"],
    ]);

    const settings = byName["DeviceSettings"]?.type;
    const network = settings?.kind === "object" ? settings.fields[1] : undefined;
    expect(network?.type).toEqual({
      kind: "object",
      fields: [
        { name: "dhcp", type: { kind: "primitive", name: "boolean" }, optional: false },
        { name: "ip", type: { kind: "primitive", name: "string" }, optional: false },
        { name: "subnet", type: { kind: "primitive", name: "string" }, optional: false },
        { name: "gateway", type: { kind: "primitive", name: "string" }, optional: false },
      ].map((f) => ({ ...f, description: undefined })),
    });

    expect(byName["DeviceStatus"]?.type).toEqual({
      kind: "union",
      types: [
        { kind: "literal", value: "online" },
        { kind: "literal", value: "offline" },
        { kind: "literal", value: "warning" },
      ],
    });
  });

  it("handles optional fields, arrays, null, literals and JSDoc", () => {
    const { declarations, diagnostics } = parseDataModel(`
      /** タグ */
      type Tag = { label: string };
      interface Item {
        /** 識別子 */
        id: string;
        note?: string | null;
        tags: Tag[];
        scores: Array<number>;
        level: 1 | -1 | true;
      }
    `);
    expect(diagnostics).toEqual([]);
    expect(declarations[0]?.description).toBe("タグ");
    const item = declarations[1]?.type;
    if (item?.kind !== "object") throw new Error("object expected");
    expect(item.fields.map((f) => [f.name, formatType(f.type), f.optional, f.description])).toEqual(
      [
        ["id", "string", false, "識別子"],
        ["note", "string | null", true, undefined],
        ["tags", "Tag[]", false, undefined],
        ["scores", "number[]", false, undefined],
        ["level", "1 | -1 | true", false, undefined],
      ],
    );
  });

  it("reports syntax errors, unknown references and unsupported types", () => {
    expect(parseDataModel("interface A { id: string").diagnostics[0]?.message).toMatch(/expected/);

    const { diagnostics } = parseDataModel(`
      interface A { b: B; m: Map<string, number>; f(): void }
      const x = 1;
    `);
    expect(diagnostics.map((d) => d.message)).toEqual([
      "型 Map<string, number> には対応していません",
      "プロパティ以外のメンバー（メソッドなど）は無視します",
      "型定義（interface / type）以外の文は無視します",
      "型 B が見つかりません",
    ]);
  });
});

describe("parseTypeExpression", () => {
  it("parses a single type expression", () => {
    expect(parseTypeExpression('"a" | "b"')).toEqual({
      type: {
        kind: "union",
        types: [
          { kind: "literal", value: "a" },
          { kind: "literal", value: "b" },
        ],
      },
      diagnostics: [],
    });
    expect(parseTypeExpression("Device[]").type).toEqual({
      kind: "array",
      element: { kind: "ref", name: "Device" },
    });
    expect(parseTypeExpression("string;").diagnostics).not.toEqual([]);
    expect(parseTypeExpression("{").diagnostics).not.toEqual([]);
  });
});

describe("printDataModel", () => {
  it("round-trips the example data model", () => {
    const source = exampleProject().dataModel.source;
    const parsed = parseDataModel(source);
    const printed = printDataModel(parsed.declarations);
    expect(parseDataModel(printed)).toEqual(parsed);
    expect(printed).toContain('type DeviceStatus = "online" | "offline" | "warning";');
    expect(printed).toContain(
      "  network: { dhcp: boolean; ip: string; subnet: string; gateway: string };",
    );
  });

  it("writes JSDoc and quotes non-identifier field names", () => {
    expect(
      printDataModel([
        {
          name: "A",
          declaration: "interface",
          description: "説明",
          type: {
            kind: "object",
            fields: [
              {
                name: "x-y",
                optional: true,
                description: "フィールド",
                type: {
                  kind: "array",
                  element: {
                    kind: "union",
                    types: [
                      { kind: "primitive", name: "string" },
                      { kind: "primitive", name: "null" },
                    ],
                  },
                },
              },
            ],
          },
        },
      ]),
    ).toBe('/** 説明 */\ninterface A {\n  /** フィールド */\n  "x-y"?: (string | null)[];\n}\n');
  });
});
