import type { Action, Node, Project } from "@ui-editor/poc-model";
import { describe, expect, it } from "vitest";
import { generate, GenerateError } from "./generate.js";
import { EXAMPLES } from "./node.js";

/** 題材に、画面 home（中身 root・mount）を足して生成し、ファイルの中身を返す。 */
async function generateWith(
  root: Node,
  options: { mount?: Action[]; recipe?: (p: Project) => void } = {},
): Promise<Record<string, string>> {
  const p = structuredClone(EXAMPLES[0]!.load());
  p.screens.push({
    id: "home-page",
    name: "ホーム",
    entity: "Device",
    params: { deviceId: { type: "ref", entity: "Device" } },
    root,
    ...(options.mount ? { events: { mount: options.mount } } : {}),
  });
  options.recipe?.(p);
  const files = await generate(p);
  return Object.fromEntries(files.map((f) => [f.path, f.content]));
}

const box = (...children: Node[]): Node => ({ id: "page", type: "Box", children });
const button = (actions: Action[], props: Node["props"] = { label: "押す" }): Node => ({
  id: "btn",
  type: "Button",
  props,
  events: { click: actions },
});
const home = async (...args: Parameters<typeof generateWith>) =>
  (await generateWith(...args))["src/screens/HomePageScreen.tsx"]!;

describe("画面・ダイアログのコード", () => {
  it("- を含む id は PascalCase のコンポーネントにし、ルートを作る", async () => {
    const files = await generateWith(box({ id: "t", type: "Text", props: { text: "ようこそ" } }));
    expect(files["src/screens/HomePageScreen.tsx"]).toContain("export function HomePageScreen()");
    expect(files["src/App.tsx"]).toContain(
      '<Route path="/home-page" element={<HomePageScreen />} />',
    );
    expect(files["src/model/screens.ts"]).toContain(
      '"home-page": { path: "/home-page", params: { deviceId: "string" } },',
    );
  });

  it("式で使った名前だけフックで用意する（record は ref パラメータで引く）", async () => {
    const src = await home(box({ id: "t", type: "Text", props: { text: "{{ record?.name }}" } }));
    expect(src).toContain('const params = useScreenParams("home-page");');
    expect(src).toContain('const record = useRecord("Device", params.deviceId);');
    expect(src).not.toContain("useDataView");
    expect(src).not.toContain("useUiState");
  });

  it("when は if、失敗しうるアクションのあとは return で止める", async () => {
    const src = await home(
      box(
        button([
          {
            type: "deleteRecord",
            entity: "Device",
            match: { id: "{{ params.deviceId }}" },
            when: "{{ params.deviceId !== undefined }}",
          },
          { type: "navigate", to: "devices" },
        ]),
      ),
    );
    expect(src).toContain("if (params.deviceId !== undefined) {");
    expect(src).toContain("if (!deleteDevice({ id: params.deviceId }).ok) return;");
    expect(src).toContain('navigate("devices");');
  });

  it("データを変えたあとに data を使うアクションは、ストアから読み直す", async () => {
    const src = await home(
      box(
        button([
          { type: "createRecord", entity: "Device", values: { name: "新しい機器" } },
          {
            type: "navigate",
            to: "deviceDetail",
            params: { deviceId: "{{ data.Device.at(-1)?.id ?? '' }}" },
          },
        ]),
      ),
    );
    expect(src).toContain('if (!createDevice({ name: "新しい機器" }).ok) return;');
    expect(src).toContain("const data = readDataView();");
    expect(src).not.toContain("useDataView");
  });

  it("openDialog の onClose は結果ごとの関数（あとで呼ぶので record などは読み直す）", async () => {
    const src = await home(
      box(
        button([
          {
            type: "openDialog",
            dialog: "deviceEdit",
            params: { deviceId: "{{ params.deviceId ?? '' }}" },
            onClose: { ok: [{ type: "setState", path: "lastSaved", value: "{{ record?.name }}" }] },
          },
        ]),
      ),
      { recipe: (p) => void (p.state.lastSaved = "") },
    );
    expect(src).toMatch(
      /openDialog\(\s*"deviceEdit",\s*\{ deviceId: params\.deviceId \?\? "" \},\s*\{\s*ok: \(\) => \{\s*\/\/ 直前のアクションの結果を読み直す\s*const record = readRecord\("Device", params\.deviceId\);/,
    );
    expect(src).toContain('setUiState("lastSaved", record?.name);');
  });

  it("requires のあるボタンは押せない状態とガード（型が絞られる）", async () => {
    const src = await home(
      box(
        button(
          [
            {
              type: "openDialog",
              dialog: "deviceDelete",
              params: { deviceId: "{{ state.selection.Device.id }}" },
            },
          ],
          { label: "削除", requires: "selection.Device" },
        ),
      ),
    );
    expect(src).toContain("requires={state.selection.Device}");
    expect(src).toContain('requiresMessage="機器を選ぶと押せます"');
    expect(src).toContain("if (!present(state.selection.Device)) return;");
  });

  it("フォームでないところの setDraft はプレビューと同じく失敗にする", async () => {
    const src = await home(box(button([{ type: "setDraft", field: "name", value: "x" }])));
    expect(src).toContain(
      'notify("error", "フォーム（kind: form と entity）ではないので下書きがありません");',
    );
  });

  it("repeat は map、visible は条件、mount は useMount", async () => {
    const src = await home(
      box({
        id: "item",
        type: "Text",
        repeat: { each: "{{ data.Device }}", as: "device", key: "{{ device.id }}" },
        visible: "{{ device.status !== 'offline' }}",
        props: { text: "{{ index + 1 }}. {{ device.name }}" },
      }),
      { mount: [{ type: "select", entity: "Device", id: null }] },
    );
    expect(src).toContain("(data.Device ?? []).map((device, index) =>");
    expect(src).toContain("<Fragment key={device.id}>");
    expect(src).toContain('device.status !== "offline" ? (');
    expect(src).toContain("${text(index + 1)}. ${text(device.name)}");
    expect(src).toContain('useMount(() => select("Device", null));');
  });

  it("表: entity があれば行の key・選択・rowSelect で選ぶ。row・index は列と行のイベントで使える", async () => {
    const src = await home(
      box({
        id: "table",
        type: "Table",
        props: {
          rows: "{{ data.Device }}",
          entity: "Device",
          selectable: true,
          columns: [{ header: "#", value: "{{ index + 1 }}" }],
        },
        events: { rowClick: [{ type: "setState", path: "picked", value: "{{ row.name }}" }] },
      }),
      { recipe: (p) => void (p.state.picked = "") },
    );
    expect(src).toContain("rowKey={(row) => row.id}");
    expect(src).toContain("selectedKey={state.selection.Device?.id}");
    expect(src).toContain('{ header: "#", value: (row, index) => index + 1 }');
    expect(src).toContain("const row = event.row;");
    expect(src).toContain('onRowSelect={(event) => select("Device", event.row.id)}');
  });

  it("式の誤り・使えない名前は、場所付きの生成時エラー", async () => {
    const error = await generateWith(
      box(
        { id: "a", type: "Text", props: { text: "{{ window.location }}" } },
        button([
          { type: "navigate", to: "deviceDetail", params: { deviceId: "{{ event.value }}" } },
        ]),
        { id: "b", type: "Text", props: { text: "{{ record?. }}" } },
      ),
    ).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(GenerateError);
    const problems = (error as GenerateError).problems;
    expect(problems[0]).toMatch(
      /^画面 home-page \/ page \/ a \/ props: \{\{ window\.location \}\}: window はここでは使えません/,
    );
    expect(problems[1]).toMatch(
      /^画面 home-page \/ page \/ btn \/ events\.click\[0\] navigate: \{\{ event\.value \}\}: event はここでは使えません/,
    );
    expect(problems[2]).toMatch(/^画面 home-page \/ page \/ b \/ props: \{\{ record\?\. \}\}/);
  });

  it("repeat の as に生成するコードの名前は使えない", async () => {
    const error = await generateWith(
      box({ id: "x", type: "Text", repeat: { each: "{{ [] }}", as: "text" } }),
    ).catch((e: unknown) => e);
    expect((error as GenerateError).problems).toEqual([
      '画面 home-page / page / x / repeat.as: "text" は生成するコードの名前と同じなので使えません',
    ]);
  });
});

describe("ER からの生成で作った画面", () => {
  it("全エンティティの一覧・詳細・フォーム・削除の確認を生成できる（入れ子のフォームは親を渡す）", async () => {
    const files = await generate(EXAMPLES[1]!.load());
    const form = files.find((f) => f.path === "src/dialogs/AlarmFormDialog.tsx")!.content;
    expect(form).toContain(
      'const form = useForm("Alarm", { recordId: params.alarmId, parentId: params.deviceId });',
    );
    expect(files.filter((f) => f.path.startsWith("src/screens/"))).toHaveLength(8);
  });
});
