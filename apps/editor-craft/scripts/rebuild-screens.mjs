/**
 * 題材ファイルの S1〜S3 を、エディタの UI 操作（パレット・プロパティ欄・style 欄・詳細（JSON））だけで
 * 新しい画面として組み立て直し、操作数と、保存したファイルが元の画面と一致するかを調べる（#24 の評価用）。
 *
 *   pnpm --filter @ui-editor/editor-craft dev          # 別のターミナルで起動しておく
 *   pnpm --filter @ui-editor/editor-craft eval:rebuild
 *
 * ブラウザはインストール済みの Chrome を使う（CHROME_CHANNEL で変更可）。
 */
import { readFileSync } from "node:fs";
import { isDeepStrictEqual } from "node:util";
import { chromium } from "playwright-core";

const url = process.env.EDITOR_URL ?? "http://localhost:5175/";
const ex = JSON.parse(
  readFileSync(
    new URL("../../../packages/schema/examples/device-monitor.project.json", import.meta.url),
    "utf8",
  ),
);
const b = await chromium.launch({
  channel: process.env.CHROME_CHANNEL ?? "chrome",
  headless: true,
});
const p = await b.newPage({ viewport: { width: 1400, height: 1000 }, acceptDownloads: true });
const errors = [];
p.on("pageerror", (e) => errors.push(e.message));
await p.goto(url);

let ops = 0;
let jsonOps = 0;
const jsonKeys = {};
const LABEL = {
  Box: "Container（flex）",
  Text: "Text",
  Button: "Button",
  TextInput: "Input（文字）",
  NumberInput: "Input（数値）",
  Checkbox: "Checkbox",
  Table: "Table",
};
const compLabel = Object.fromEntries(ex.components.map((c) => [c.id, `${c.id}（${c.name}）`]));
const PANEL_PROPS = {
  Text: ["text", "variant"],
  Button: ["label", "variant", "disabled"],
  TextInput: ["label", "value", "placeholder", "disabled"],
  NumberInput: ["label", "value", "min", "max", "step", "disabled"],
  Checkbox: ["label", "checked", "disabled"],
  Table: ["rows", "columns"],
};

const panel = () => p.locator(".props-panel");
const labelled = (scope, name) =>
  scope
    .filter({ has: p.locator(":scope > span").getByText(name, { exact: true }) })
    .locator("input, textarea, select")
    .first();
const field = (name) => labelled(panel().locator(":scope > label.field"), name);
const jsonField = (name) => labelled(panel().locator("details label.field"), name);
const text = (v) => (v === undefined ? "" : typeof v === "string" ? v : JSON.stringify(v));
async function commit(loc, value) {
  ops++;
  if ((await loc.evaluate((e) => e.tagName)) === "SELECT") await loc.selectOption(value);
  else {
    await loc.fill(value);
    await loc.blur();
  }
}
async function select(nodeId) {
  ops++;
  await p
    .locator(".layers .layer-row")
    .filter({ has: p.locator(".layer-id").getByText(nodeId, { exact: true }) })
    .first()
    .click();
}
async function propsNow() {
  // 詳細（JSON）の props 欄から現在の値を読む（操作には数えない）
  const t = await jsonField("props").inputValue();
  return t ? JSON.parse(t) : {};
}
async function styleNow() {
  const out = {};
  for (const el of await panel().locator(".style-panel [aria-label]").all()) {
    const v = await el.inputValue();
    if (v) out[await el.getAttribute("aria-label")] = v;
  }
  return out;
}
async function openDetails() {
  const d = panel().locator("details.json-details");
  if (!(await d.evaluate((e) => e.open))) {
    ops++;
    await d.locator("summary").click();
  }
}

async function build(node, parentId, isRoot, compDefs) {
  if (!isRoot) {
    await select(parentId);
    ops++;
    await p
      .locator(".palette-item", { hasText: LABEL[node.type] ?? compLabel[node.type] })
      .first()
      .click();
    await commit(field("id"), node.id);
  }
  await openDetails();
  // props: パネルの欄で入れる。既定値で入った余分なキーは空にする
  const target = node.props ?? {};
  const fields = LABEL[node.type]
    ? (PANEL_PROPS[node.type] ?? [])
    : Object.keys(compDefs[node.type]?.props ?? {});
  const before = await propsNow();
  const keys = new Set([...Object.keys(target), ...Object.keys(before)]);
  if ([...Object.keys(target)].every((k) => fields.includes(k))) {
    for (const k of keys)
      if (text(before[k]) !== text(target[k])) await commit(field(k), text(target[k]));
  } else {
    jsonOps++;
    jsonKeys[`props(${node.type})`] = (jsonKeys[`props(${node.type})`] ?? 0) + 1;
    await commit(jsonField("props"), node.props ? JSON.stringify(node.props) : "");
  }
  // style
  const st = await styleNow();
  for (const k of new Set([...Object.keys(st), ...Object.keys(node.style ?? {})])) {
    const want = text(node.style?.[k]);
    if (st[k] !== want) await commit(panel().locator(`.style-panel [aria-label="${k}"]`), want);
  }
  // repeat / visible / events は詳細（JSON）で
  for (const k of ["repeat", "visible", "events"]) {
    if (node[k] !== undefined) {
      jsonOps++;
      jsonKeys[k] = (jsonKeys[k] ?? 0) + 1;
      await commit(jsonField(k), JSON.stringify(node[k]));
    }
  }
  for (const c of node.children ?? []) await build(c, node.id, false, compDefs);
}

const compDefs = Object.fromEntries(ex.components.map((c) => [c.id, c]));
const results = [];
for (const s of ex.screens) {
  const t0 = Date.now();
  const ops0 = ops;
  const json0 = jsonOps;
  const id = `${s.id}2`;
  await p.getByLabel("作る種類").selectOption("screen");
  await p.getByLabel("新しい id").fill(id);
  await p.getByLabel("新しい名前").fill(`${s.name}（再作成）`);
  ops += 2;
  await p.getByRole("button", { name: "作成", exact: true }).click();
  for (const [name, def] of Object.entries(s.params ?? {})) {
    ops += 3;
    await p.getByLabel("追加する名前").fill(name);
    await p.getByLabel("追加する型").fill(def.type);
    await p.getByRole("button", { name: "追加", exact: true }).first().click();
  }
  await select("page");
  await build(s.root, null, true, compDefs);
  results.push({
    screen: s.id,
    nodes: JSON.stringify(s.root).match(/"id":/g).length,
    ops: ops - ops0,
    jsonOps: jsonOps - json0,
    sec: (Date.now() - t0) / 1000,
  });
}
const [dl] = await Promise.all([
  p.waitForEvent("download"),
  p.getByRole("button", { name: "JSON で保存" }).click(),
]);
const saved = JSON.parse(readFileSync(await dl.path(), "utf8"));
for (const s of ex.screens) {
  const built = saved.screens.find((x) => x.id === `${s.id}2`);
  const r = results.find((x) => x.screen === s.id);
  r.rootEqual = isDeepStrictEqual(built.root, s.root);
  r.paramsEqual = isDeepStrictEqual(built.params, s.params);
  r.eventsEqual = isDeepStrictEqual(built.events, s.events);
  if (!r.rootEqual) console.log(JSON.stringify(built.root).slice(0, 400));
}
console.table(results);
console.log(jsonKeys);
console.log("保存:", await p.locator(".message-bar strong").innerText());
// 画面のイベント（events.mount）はエディタで編集できないので、root と params の一致だけを合否にする
if (results.some((r) => !r.rootEqual || !r.paramsEqual)) process.exitCode = 1;
console.log("errors:", errors);
await b.close();
