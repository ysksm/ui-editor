import { basename } from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { appNameOf, generate } from "@ui-editor/poc-codegen";
import { writeFiles } from "@ui-editor/poc-codegen/node";
import {
  addContainer,
  addEntity,
  addField,
  addNode,
  addRelation,
  addTransition,
  addTransitionFrom,
  BUILTIN_NODE_TYPES,
  checkProject,
  containers,
  createEmptyProject,
  deleteContainer,
  deleteEntity,
  deleteField,
  deleteTransition,
  EventsSchema,
  extractTransitions,
  FieldSchema,
  formatIssue,
  generateScreens,
  JsonValueSchema,
  moveNodeInto,
  removeNode,
  serializeProject,
  setEntry,
  setTransitionParams,
  setTrigger,
  updateEntity,
  updateField,
  updateNode,
  validateProject,
  type Issue,
  type JsonValue,
  type Project,
} from "@ui-editor/poc-model";
import { generateSampleData } from "@ui-editor/poc-seed";
import { z } from "zod";
import { Workspace } from "./workspace.js";

const NAME = "ui-editor-poc";
const VERSION = "0.0.0";

const INSTRUCTIONS = `Original PoC のプロジェクトファイル（*.poc.json）を操作する。

進め方: create_project → add_entity / add_field / add_relation → generate_sample_data → generate_screens → validate_project → export_code。
編集のツールは、結果とあわせてプロジェクト全体の検証の結果（issues）を返す。エラーが残っていると export_code は書き出さない。
エディタで開いている内容には反映されない。編集のあとは、エディタでファイルを開き直す。`;

const file = z
  .string()
  .min(1)
  .describe("プロジェクトファイル（*.poc.json）のパス。--root からの相対パスか絶対パス");
const entity = z.string().min(1).describe("エンティティの id");
const container = z.string().min(1).describe("画面またはダイアログの id");
const node = z.string().min(1).describe("部品（ノード）の id");
const transitionKey = z
  .string()
  .min(1)
  .describe("list_transitions が返す key。編集で変わることがあるので、使う直前に取り直す");

const READ_ONLY = { readOnlyHint: true, idempotentHint: true } as const;
const WRITE = { readOnlyHint: false, destructiveHint: false } as const;
const DESTRUCTIVE = { readOnlyHint: false, destructiveHint: true } as const;

/** 検証の結果を、件数と読める文にする。 */
function summarizeIssues(issues: readonly Issue[]) {
  return {
    errors: issues.filter((i) => i.severity === "error").length,
    warnings: issues.filter((i) => i.severity === "warning").length,
    messages: issues.map(formatIssue),
  };
}

function reply(value: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }] };
}

function outline(project: Project) {
  return {
    name: project.name,
    description: project.description,
    entry: project.entry,
    entities: project.entities.map((e) => ({
      id: e.id,
      name: e.name,
      fields: e.fields.map((f) => f.id),
    })),
    containers: containers(project).map(({ kind, container: c }) => ({
      id: c.id,
      kind,
      name: c.name,
      role: c.kind,
      entity: c.entity,
    })),
    records: Object.fromEntries(Object.entries(project.data).map(([k, v]) => [k, v.length])),
  };
}

/** MCP のツールをそろえたサーバーを作る。読み書きは root の中に限る。 */
export function createServer(options: { root: string }): McpServer {
  const workspace = new Workspace(options.root);
  const server = new McpServer({ name: NAME, version: VERSION }, { instructions: INSTRUCTIONS });

  /**
   * 読む → 変える → 検証する → 保存する。
   * 例外や形の崩れがあれば保存しない。参照のエラーは作りかけで普通に起きるので、保存して issues で返す。
   */
  const edit = <T>(path: string, change: (draft: Project) => T) => {
    const draft = workspace.readProject(path);
    const result = change(draft);
    const checked = validateProject(draft);
    if (!checked.success)
      throw new Error(`保存しませんでした:\n${checked.issues.map(formatIssue).join("\n")}`);
    workspace.writeText(path, serializeProject(checked.project));
    return reply({ result: result ?? "ok", issues: summarizeIssues(checked.issues) });
  };

  // ---- プロジェクト ----

  server.registerTool(
    "create_project",
    {
      description: "空のプロジェクトファイルを作る。ファイルが既にあれば作らない",
      inputSchema: { file, name: z.string().min(1).optional().describe("プロジェクト名") },
      annotations: WRITE,
    },
    ({ file, name }) => {
      if (workspace.exists(file)) throw new Error(`${file} は既にあります`);
      workspace.writeText(file, serializeProject(createEmptyProject(name)));
      return reply({ result: file });
    },
  );

  server.registerTool(
    "get_project",
    {
      description:
        "プロジェクトの内容を返す。section の既定 summary は id と件数の一覧で、all は全体（大きくなる）",
      inputSchema: {
        file,
        section: z
          .enum(["summary", "entities", "data", "state", "screens", "dialogs", "all"])
          .optional(),
      },
      annotations: READ_ONLY,
    },
    ({ file, section = "summary" }) => {
      const project = workspace.readProject(file);
      if (section === "summary") return reply(outline(project));
      return reply(section === "all" ? project : project[section]);
    },
  );

  server.registerTool(
    "validate_project",
    {
      description: "形と参照・整合性を検証し、エラーと警告の件数と内容を返す",
      inputSchema: { file },
      annotations: READ_ONLY,
    },
    ({ file }) => reply(summarizeIssues(checkProject(workspace.readProject(file)))),
  );

  // ---- ER ----

  server.registerTool(
    "add_entity",
    {
      description:
        "エンティティを足す。id は英大文字で始める（例: Device）。主キーのフィールド id は自動で入る",
      inputSchema: {
        file,
        id: z.string().min(1).optional(),
        name: z.string().min(1).optional().describe("表示名"),
      },
      annotations: WRITE,
    },
    ({ file, id, name }) => edit(file, (d) => addEntity(d, { id, name })),
  );

  server.registerTool(
    "update_entity",
    {
      description: "エンティティの表示名・表示用フィールド・データの読み方を変える",
      inputSchema: {
        file,
        entity,
        name: z.string().min(1).optional(),
        displayField: z.string().min(1).optional().describe("一覧や参照で見出しに使うフィールド"),
        loading: z
          .enum(["all", "paged"])
          .optional()
          .describe("all は起動時に全件、paged は画面ごとに読む（既定 all）"),
      },
      annotations: WRITE,
    },
    ({ file, entity, name, displayField, loading }) =>
      edit(file, (d) =>
        updateEntity(d, entity, {
          ...(name !== undefined && { name }),
          ...(displayField !== undefined && { displayField }),
          ...(loading !== undefined && { loading }),
        }),
      ),
  );

  server.registerTool(
    "delete_entity",
    {
      description: "エンティティを消す。そのデータも消える",
      inputSchema: { file, entity },
      annotations: DESTRUCTIVE,
    },
    ({ file, entity }) => edit(file, (d) => deleteEntity(d, entity)),
  );

  server.registerTool(
    "add_field",
    {
      description: "エンティティにフィールド（属性）を足す。関係は add_relation を使う",
      inputSchema: { file, entity, field: FieldSchema.partial() },
      annotations: WRITE,
    },
    ({ file, entity, field }) => edit(file, (d) => addField(d, entity, field)),
  );

  server.registerTool(
    "update_field",
    {
      description: "フィールドを変える（id 以外）。型を変えると、その型で使わない設定は消える",
      inputSchema: {
        file,
        entity,
        field: z.string().min(1).describe("フィールドの id"),
        patch: FieldSchema.omit({ id: true }).partial(),
      },
      annotations: WRITE,
    },
    ({ file, entity, field, patch }) => edit(file, (d) => updateField(d, entity, field, patch)),
  );

  server.registerTool(
    "delete_field",
    {
      description: "フィールドを消す。レコードの値も消える",
      inputSchema: { file, entity, field: z.string().min(1).describe("フィールドの id") },
      annotations: DESTRUCTIVE,
    },
    ({ file, entity, field }) => edit(file, (d) => deleteField(d, entity, field)),
  );

  server.registerTool(
    "add_relation",
    {
      description:
        "関係を足す。one-to-many / one-to-one は from の中に to を入れ子で持ち、many-to-one は from から to を参照する",
      inputSchema: {
        file,
        from: entity,
        to: entity,
        kind: z.enum(["one-to-many", "one-to-one", "many-to-one"]),
      },
      annotations: WRITE,
    },
    ({ file, from, to, kind }) => edit(file, (d) => addRelation(d, from, to, kind)),
  );

  // ---- データ ----

  server.registerTool(
    "generate_sample_data",
    {
      description: "ER からサンプルデータを作る。今のデータはすべて置き換わる",
      inputSchema: {
        file,
        counts: z
          .record(z.string(), z.number().int().min(0))
          .optional()
          .describe("エンティティ id → 件数。入れ子のエンティティは全親の合計"),
        seed: z.number().int().optional().describe("乱数のシード。同じなら同じデータになる"),
      },
      annotations: DESTRUCTIVE,
    },
    ({ file, counts, seed }) =>
      edit(file, (d) => {
        const { data, ...rest } = generateSampleData(d.entities, { counts, seed });
        d.data = data;
        return rest;
      }),
  );

  // ---- 画面 ----

  server.registerTool(
    "generate_screens",
    {
      description:
        "エンティティから一覧・詳細（画面）とフォーム・削除の確認（ダイアログ）を、遷移つきで作る。入れ子の子は親の画面を作ってから呼ぶ",
      inputSchema: {
        file,
        entity,
        list: z.boolean().optional(),
        detail: z.boolean().optional(),
        form: z.boolean().optional(),
        confirm: z.boolean().optional(),
      },
      annotations: WRITE,
    },
    ({ file, entity, ...options }) =>
      edit(file, (d) => {
        const { list, detail, form, confirm } = options;
        return generateScreens(d, entity, {
          ...(list !== undefined && { list }),
          ...(detail !== undefined && { detail }),
          ...(form !== undefined && { form }),
          ...(confirm !== undefined && { confirm }),
        });
      }),
  );

  server.registerTool(
    "add_container",
    {
      description: "空の画面かダイアログを足す",
      inputSchema: {
        file,
        kind: z.enum(["screen", "dialog"]),
        id: z.string().min(1).optional(),
        name: z.string().min(1).optional(),
      },
      annotations: WRITE,
    },
    ({ file, kind, id, name }) => edit(file, (d) => addContainer(d, kind, { id, name })),
  );

  server.registerTool(
    "delete_container",
    {
      description: "画面かダイアログを消す。そこへの遷移も消える",
      inputSchema: { file, container },
      annotations: DESTRUCTIVE,
    },
    ({ file, container }) => edit(file, (d) => deleteContainer(d, container)),
  );

  server.registerTool(
    "set_entry",
    {
      description: "最初に開く画面を決める",
      inputSchema: { file, screen: z.string().min(1).describe("画面の id") },
      annotations: WRITE,
    },
    ({ file, screen }) => edit(file, (d) => setEntry(d, screen)),
  );

  server.registerTool(
    "add_node",
    {
      description: "画面・ダイアログに部品を足す。parent を省くと root の末尾に入る",
      inputSchema: {
        file,
        container,
        type: z.enum(BUILTIN_NODE_TYPES),
        id: z.string().min(1).optional(),
        parent: z.string().min(1).optional().describe("親の Box の id"),
        index: z.number().int().min(0).optional().describe("親の中の位置"),
      },
      annotations: WRITE,
    },
    ({ file, container, type, id, parent, index }) =>
      edit(file, (d) =>
        addNode(d, container, type, { parent, index, ...(id !== undefined && { id }) }),
      ),
  );

  server.registerTool(
    "update_node",
    {
      description:
        "部品を変える。props は指定したキーだけ変わり、値が null のキーは消える。文言などには {{ record?.name }} の形の式を書ける",
      inputSchema: {
        file,
        container,
        node,
        props: z.record(z.string(), JsonValueSchema).optional(),
        visible: z.union([z.boolean(), z.string()]).optional().describe("真偽値か式"),
        events: EventsSchema.optional().describe("イベント名 → アクションの列。全体を置き換える"),
      },
      annotations: WRITE,
    },
    ({ file, container, node, props, visible, events }) =>
      edit(file, (d) =>
        updateNode(d, container, node, {
          ...(props && {
            props: Object.fromEntries(
              Object.entries(props).map(([k, v]): [string, JsonValue | undefined] => [
                k,
                v === null ? undefined : v,
              ]),
            ),
          }),
          ...(visible !== undefined && { visible }),
          ...(events !== undefined && { events }),
        }),
      ),
  );

  server.registerTool(
    "move_node",
    {
      description: "部品を別の Box の中へ、または同じ Box の中の別の位置へ動かす",
      inputSchema: {
        file,
        container,
        node,
        parent: z.string().min(1).describe("移動先の Box の id"),
        index: z.number().int().min(0).optional(),
      },
      annotations: WRITE,
    },
    ({ file, container, node, parent, index }) =>
      edit(file, (d) => moveNodeInto(d, container, node, parent, index)),
  );

  server.registerTool(
    "remove_node",
    {
      description: "部品を消す。子の部品と、その部品から出る遷移も消える",
      inputSchema: { file, container, node },
      annotations: DESTRUCTIVE,
    },
    ({ file, container, node }) => edit(file, (d) => removeNode(d, container, node)),
  );

  // ---- 遷移 ----

  server.registerTool(
    "list_transitions",
    {
      description: "すべての遷移（key・遷移元・遷移先・トリガー・パラメータ）を返す",
      inputSchema: { file },
      annotations: READ_ONLY,
    },
    ({ file }) => reply(extractTransitions(workspace.readProject(file))),
  );

  server.registerTool(
    "add_transition",
    {
      description:
        "from から to（画面かダイアログ）への遷移を足す。node を省くと仮のボタンを置く。作った遷移の key を返す",
      inputSchema: {
        file,
        from: container,
        to: container,
        node: node.optional().describe("トリガーにする部品（ボタン・表など）の id"),
      },
      annotations: WRITE,
    },
    ({ file, from, to, node }) =>
      edit(file, (d) =>
        node === undefined ? addTransition(d, from, to) : addTransitionFrom(d, from, node, to),
      ),
  );

  server.registerTool(
    "set_trigger",
    {
      description:
        "遷移のトリガーを変える。button: ボタンの click、rowClick: 表の行クリック、selectButton: 表で選んでボタン、mount: 画面を開いたとき。新しい key を返す",
      inputSchema: {
        file,
        key: transitionKey,
        trigger: z.discriminatedUnion("kind", [
          z.object({ kind: z.literal("button"), node: z.string().optional() }),
          z.object({
            kind: z.literal("rowClick"),
            node: z.string().optional(),
            entity: z.string().optional(),
          }),
          z.object({
            kind: z.literal("selectButton"),
            node: z.string().optional(),
            table: z.string().optional(),
            entity: z.string(),
          }),
          z.object({ kind: z.literal("mount") }),
        ]),
      },
      annotations: WRITE,
    },
    ({ file, key, trigger }) => edit(file, (d) => setTrigger(d, key, trigger)),
  );

  server.registerTool(
    "set_transition_params",
    {
      description: "遷移で渡す値を決める。値には {{ row.id }} の形の式を書ける。null で消す",
      inputSchema: {
        file,
        key: transitionKey,
        params: z.record(z.string(), JsonValueSchema).nullable(),
      },
      annotations: WRITE,
    },
    ({ file, key, params }) => edit(file, (d) => setTransitionParams(d, key, params ?? undefined)),
  );

  server.registerTool(
    "delete_transition",
    {
      description: "遷移を消す。空になったイベントと仮の部品も消える",
      inputSchema: { file, key: transitionKey },
      annotations: DESTRUCTIVE,
    },
    ({ file, key }) => edit(file, (d) => deleteTransition(d, key)),
  );

  // ---- 書き出し ----

  server.registerTool(
    "export_code",
    {
      description:
        "Vite + React + TypeScript のアプリとして書き出す（エディタ・CLI と同じ出力）。エラーがあれば書き出さず理由を返す。空でないフォルダには overwrite が無いと書き出さない",
      inputSchema: {
        file,
        out: z.string().min(1).describe("書き出すフォルダ"),
        appName: z.string().min(1).optional().describe("package.json の name"),
        overwrite: z.boolean().optional().describe("同じ名前のファイルを上書きする"),
      },
      annotations: { readOnlyHint: false, destructiveHint: true },
    },
    async ({ file, out, appName, overwrite }) => {
      const project = workspace.readProject(file);
      const outDir = workspace.resolve(out);
      if (!overwrite && !workspace.isEmptyDir(out))
        throw new Error(`${out} は空ではありません（上書きするなら overwrite を指定する）`);
      const files = await generate(project, {
        appName: appName ?? appNameOf(basename(file)),
      });
      writeFiles(outDir, files);
      return reply({
        result: { outDir, files: files.length, run: "pnpm install && pnpm dev" },
        issues: summarizeIssues(checkProject(project)),
      });
    },
  );

  return server;
}
