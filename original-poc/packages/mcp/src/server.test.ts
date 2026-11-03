import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createServer } from "./server.js";

const EXAMPLE = new URL("../../../examples/device-monitor.poc.json", import.meta.url).pathname;

let root: string;
let outside: string;
let client: Client;

interface ToolResult {
  isError?: boolean;
  content: { type: string; text: string }[];
}

/** ツールを呼び、結果の文（JSON なら読んだ値）を返す。 */
async function raw(name: string, args: Record<string, unknown>) {
  const result = (await client.callTool({ name, arguments: args })) as ToolResult;
  return { isError: result.isError ?? false, text: result.content[0]!.text };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- ツールごとに形が違う JSON を読むテスト
async function call(name: string, args: Record<string, unknown>): Promise<any> {
  const { isError, text } = await raw(name, args);
  if (isError) throw new Error(text);
  return JSON.parse(text);
}

beforeEach(async () => {
  root = realpathSync(mkdtempSync(join(tmpdir(), "poc-mcp-")));
  outside = realpathSync(mkdtempSync(join(tmpdir(), "poc-mcp-outside-")));
  const [a, b] = InMemoryTransport.createLinkedPair();
  await createServer({ root }).connect(a);
  client = new Client({ name: "test", version: "0.0.0" });
  await client.connect(b);
});

afterEach(async () => {
  await client.close();
  rmSync(root, { recursive: true, force: true });
  rmSync(outside, { recursive: true, force: true });
});

/** 機器とアラームだけの小さなプロジェクトを作る。 */
async function buildProject(file: string) {
  await call("create_project", { file, name: "機器管理" });
  await call("add_entity", { file, id: "Device", name: "機器" });
  await call("add_field", {
    file,
    entity: "Device",
    field: { id: "name", name: "名前", type: "string", required: true },
  });
  await call("update_entity", { file, entity: "Device", displayField: "name" });
  await call("add_entity", { file, id: "Alarm", name: "アラーム" });
  await call("add_field", { file, entity: "Alarm", field: { id: "message", type: "string" } });
  await call("add_relation", { file, from: "Device", to: "Alarm", kind: "one-to-many" });
}

describe("poc-mcp", () => {
  it("ツールの入力スキーマを JSON Schema で公開する", async () => {
    const { tools } = await client.listTools();
    expect(tools.length).toBe(25);
    for (const t of tools) {
      expect(t.description, t.name).toBeTruthy();
      expect(t.inputSchema.type, t.name).toBe("object");
    }
  });

  it("空のプロジェクトから ER・データ・画面を作り、エラー 0 件でコードを書き出す", async () => {
    const file = "app/devices.poc.json";
    await buildProject(file);
    const seeded = await call("generate_sample_data", { file, counts: { Device: 2, Alarm: 4 } });
    expect(seeded.result.counts).toMatchObject({ Device: 2, Alarm: 4 });
    const device = await call("generate_screens", { file, entity: "Device" });
    expect(device.result.list).toBeTruthy();
    await call("generate_screens", { file, entity: "Alarm" });

    expect((await call("validate_project", { file })).errors).toBe(0);
    const summary = await call("get_project", { file });
    expect(summary.entities.map((e: { id: string }) => e.id)).toEqual(["Device", "Alarm"]);
    expect(summary.records.Device).toBe(2);
    expect((await call("list_transitions", { file })).length).toBeGreaterThan(0);

    const exported = await call("export_code", { file, out: "out" });
    expect(exported.result.files).toBeGreaterThan(10);
    const pkg = JSON.parse(readFileSync(join(root, "out/package.json"), "utf8"));
    expect(pkg.name).toBe("devices");
  });

  it("保存したファイルは決定的な形で、読み直せる", async () => {
    const file = "p.poc.json";
    await buildProject(file);
    const before = readFileSync(join(root, file), "utf8");
    await call("update_entity", { file, entity: "Device", name: "機器" });
    expect(readFileSync(join(root, file), "utf8")).toBe(before);
    expect(readdirSync(root)).toEqual([file]);
  });

  it("部品・遷移を編集する", async () => {
    const file = "p.poc.json";
    await call("create_project", { file });
    await call("add_container", { file, kind: "screen", id: "home" });
    await call("add_container", { file, kind: "dialog", id: "help" });
    await call("set_entry", { file, screen: "home" });
    const button = await call("add_node", { file, container: "home", type: "Button" });
    await call("update_node", {
      file,
      container: "home",
      node: button.result,
      props: { label: "ヘルプ", variant: null },
    });
    const added = await call("add_transition", {
      file,
      from: "home",
      to: "help",
      node: button.result,
    });
    await call("set_transition_params", { file, key: added.result, params: { topic: "a" } });
    let list = await call("list_transitions", { file });
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ from: "home", to: "help", params: { topic: "a" } });

    const moved = await call("set_trigger", {
      file,
      key: added.result,
      trigger: { kind: "mount" },
    });
    expect(moved.result).toBe("home::mount:0");
    await call("delete_transition", { file, key: moved.result });
    list = await call("list_transitions", { file });
    expect(list).toHaveLength(0);
  });

  it("題材のファイルを読める", async () => {
    writeFileSync(join(root, "e.poc.json"), readFileSync(EXAMPLE));
    expect((await call("validate_project", { file: "e.poc.json" })).errors).toBe(0);
    expect((await call("get_project", { file: "e.poc.json", section: "entities" })).length).toBe(4);
  });

  it("不正な入力は落ちずにツールのエラーになり、ファイルは変わらない", async () => {
    const file = "p.poc.json";
    await buildProject(file);
    const before = readFileSync(join(root, file), "utf8");

    const missing = await raw("delete_entity", { file, entity: "Nope" });
    expect(missing).toMatchObject({ isError: true });
    expect(missing.text).toContain('エンティティ "Nope" がありません');
    expect(await raw("add_entity", { file, id: "lower" })).toMatchObject({ isError: true });
    expect(await raw("add_relation", { file, from: "Device" })).toMatchObject({ isError: true });
    expect(await raw("get_project", { file: "nothing.poc.json" })).toMatchObject({ isError: true });
    expect(await raw("create_project", { file })).toMatchObject({ isError: true });
    // フィールドの型に無い値は入力の検証で止まる
    expect(
      await raw("update_field", { file, entity: "Device", field: "name", patch: { type: "x" } }),
    ).toMatchObject({ isError: true });
    expect(readFileSync(join(root, file), "utf8")).toBe(before);

    writeFileSync(join(root, "broken.poc.json"), "{");
    const broken = await raw("get_project", { file: "broken.poc.json" });
    expect(broken).toMatchObject({ isError: true });
    expect(broken.text).toContain("JSON の構文エラー");

    // サーバーは動き続ける
    expect((await call("validate_project", { file })).errors).toBe(0);
  });

  it("検証エラーがあれば書き出さず、理由を返す", async () => {
    const file = "p.poc.json";
    await call("create_project", { file });
    await call("add_container", { file, kind: "screen", id: "home" });
    const text = await call("add_node", { file, container: "home", type: "Text", id: "t" });
    await call("update_node", {
      file,
      container: "home",
      node: text.result,
      props: { text: "{{ recrd.name }}" },
    });
    const result = await raw("export_code", { file, out: "out" });
    expect(result.isError).toBe(true);
    expect(result.text).toContain("recrd");
    expect(() => readdirSync(join(root, "out"))).toThrow();
  });

  it("空でないフォルダには overwrite が無いと書き出さない", async () => {
    const file = "p.poc.json";
    await buildProject(file);
    await call("generate_screens", { file, entity: "Device" });
    mkdirSync(join(root, "out"));
    writeFileSync(join(root, "out/keep.txt"), "keep");

    expect(await raw("export_code", { file, out: "out" })).toMatchObject({ isError: true });
    await call("export_code", { file, out: "out", overwrite: true });
    expect(readFileSync(join(root, "out/keep.txt"), "utf8")).toBe("keep");
  });

  describe("root の外", () => {
    const FILE = "x.poc.json";

    beforeEach(async () => {
      await call("create_project", { file: "p.poc.json" });
      await call("add_container", { file: "p.poc.json", kind: "screen", id: "home" });
      writeFileSync(join(outside, FILE), readFileSync(join(root, "p.poc.json")));
    });

    it("絶対パス・.. では読み書きできない", async () => {
      const paths = [join(outside, FILE), `../${outside.split("/").pop()}/${FILE}`];
      for (const file of paths) {
        for (const r of [
          await raw("get_project", { file }),
          await raw("create_project", { file: `${file}.new` }),
          await raw("add_entity", { file }),
        ]) {
          expect(r.isError).toBe(true);
          expect(r.text).toContain("範囲");
        }
      }
      expect(await raw("export_code", { file: "p.poc.json", out: outside })).toMatchObject({
        isError: true,
      });
      expect(readdirSync(outside)).toEqual([FILE]);
    });

    it("root の中の絶対パスは使える", async () => {
      const summary = await call("get_project", { file: join(root, "p.poc.json") });
      expect(summary.containers).toHaveLength(1);
    });

    it("シンボリックリンクでは外に出られない", async () => {
      symlinkSync(outside, join(root, "link"));
      symlinkSync(join(outside, "new.poc.json"), join(root, "dangling.poc.json"));
      expect(await raw("get_project", { file: `link/${FILE}` })).toMatchObject({ isError: true });
      expect(await raw("create_project", { file: "link/n.poc.json" })).toMatchObject({
        isError: true,
      });
      expect(await raw("create_project", { file: "dangling.poc.json" })).toMatchObject({
        isError: true,
      });
      expect(readdirSync(outside)).toEqual([FILE]);
    });
  });
});
