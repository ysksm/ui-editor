/**
 * 題材ファイルの S1〜S3 を、エディタの UI 操作（パレットからのドラッグ・右パネルの欄・詳細（JSON）欄）だけで
 * 新しい画面として組み立て直し、操作数と、保存したファイルが元の画面とどれだけ一致するかを調べる（#18 の評価用）。
 *
 *   pnpm --filter @ui-editor/editor-puck dev             # 別のターミナルで起動しておく
 *   pnpm --filter @ui-editor/editor-puck eval:rebuild
 *
 * ブラウザはインストール済みの Chrome を使う（CHROME_CHANNEL で変更可）。
 * ドラッグ＆ドロップは座標で行うので、入れ子の入れ物では狙った入れ物に入らないことがある（README 参照）。
 * 狙いと違う所に入ったものは WARN として出す。
 */
/* global document -- page.evaluate のコールバックはブラウザで動く */
import { loadProject } from "@ui-editor/schema";
import { chromium } from "playwright-core";

const url = process.env.EDITOR_URL ?? "http://localhost:5174/";
const b = await chromium.launch({
  channel: process.env.CHROME_CHANNEL ?? "chrome",
  headless: true,
});
const p = await b.newPage({ viewport: { width: 1600, height: 1100 }, acceptDownloads: true });
const errs = [];
p.on("pageerror", (e) => errs.push(String(e)));
await p.goto(url);
await p.waitForTimeout(1500);
// 題材ファイルから始める（前回の作業が localStorage に残っていても）
await p.getByRole("button", { name: "題材を読み込む" }).click();
await p.waitForTimeout(1000);

let ops = 0;
const log = [];
const fr = () => p.frames().find((f) => f !== p.mainFrame());
const ids = async () =>
  fr().evaluate(() =>
    [...document.querySelectorAll("[data-puck-component]")].map((e) =>
      e.getAttribute("data-puck-component"),
    ),
  );

async function drag(part, x, y, via) {
  const src = p.getByText(part, { exact: true }).filter({ visible: true }).first();
  await src.scrollIntoViewIfNeeded();
  const sb = await src.boundingBox();
  await p.mouse.move(sb.x + sb.width / 2, sb.y + sb.height / 2);
  await p.mouse.down();
  const [vx, vy] = via ?? [x, y];
  for (let i = 1; i <= 25; i++) {
    await p.mouse.move(sb.x + ((vx - sb.x) * i) / 25, sb.y + ((vy - sb.y) * i) / 25);
    await p.waitForTimeout(25);
  }
  if (via)
    for (let i = 1; i <= 10; i++) {
      await p.mouse.move(vx + ((x - vx) * i) / 10, vy + ((y - vy) * i) / 10);
      await p.waitForTimeout(30);
    }
  await p.waitForTimeout(350);
  await p.mouse.up();
  await p.waitForTimeout(700);
}
/** zone = "root:items" or "<id>:children"; dir = "col" | "row". Returns new item id. */
async function add(zone, part, dir = "col", prepend = false) {
  const before = new Set(await ids());
  const z = p.frameLocator("iframe").locator(`[data-puck-dropzone="${zone}"]`);
  const bb = await z.boundingBox();
  // last direct child (page coordinates = zone bbox + offset inside the iframe document)
  const last = await z.evaluate((e) => {
    const kids = [...e.children].filter((c) => c.hasAttribute("data-puck-component"));
    const k = kids.at(-1);
    if (!k) return null;
    const r = k.getBoundingClientRect(),
      zr = e.getBoundingClientRect();
    return {
      dx: r.left - zr.left,
      dy: r.top - zr.top,
      w: r.width,
      h: r.height,
      zw: zr.width,
      zh: zr.height,
      container: k.hasAttribute("data-puck-dropzone"),
    };
  });
  let x, y;
  if (!last) {
    x = bb.x + bb.width / 2;
    y = bb.y + bb.height / 2;
  } else if (prepend) {
    x = bb.x + bb.width / 2;
    y = bb.y + 3;
  } else {
    const sc = bb.width / last.zw; // canvas zoom
    // 最後の子が入れ物なら、その外側（親の padding）を狙う。そうでなければ最後の子の後ろ寄りを狙う
    if (dir === "row") {
      x = bb.x + (last.dx + (last.container ? last.w + 4 : last.w * 0.85)) * sc;
      y = bb.y + (last.dy + last.h / 2) * sc;
    } else {
      x = bb.x + (last.dx + Math.min(30, last.w / 2)) * sc;
      y = bb.y + (last.dy + (last.container ? last.h + 4 : last.h * 0.85)) * sc;
    }
  }
  // 狙う入れ物の内側（最後の子の中ほど）を経由して近づける
  const via =
    last && !prepend
      ? [
          bb.x + (last.dx + Math.min(30, last.w / 2)) * (bb.width / last.zw),
          bb.y + (last.dy + last.h / 2) * (bb.width / last.zw),
        ]
      : undefined;
  await drag(part, x, y, via);
  ops++;
  const added = (await ids()).filter((i) => !before.has(i));
  if (added.length !== 1) throw new Error(`add ${part} to ${zone}: ${added}`);
  // check parent
  const parent = await p
    .frameLocator("iframe")
    .locator(`[data-puck-component="${added[0]}"]`)
    .evaluate((e) =>
      e.parentElement.closest("[data-puck-dropzone]")?.getAttribute("data-puck-dropzone"),
    );
  if (parent !== zone) log.push(`WARN ${part} landed in ${parent}, wanted ${zone}`);
  return added[0];
}
const fill = async (name, v) => {
  await p.locator(`input[name="${name}"]:visible`).fill(String(v));
  ops++;
};
const sel = async (title, label) => {
  await p.locator(`select[title="${title}"]:visible`).selectOption({ label });
  ops++;
};
const st = async (k, v) => {
  const s = p.locator(`select[name="style.${k}"]:visible`);
  if (await s.count()) await s.selectOption(String(v));
  else await p.locator(`input[name="style.${k}"]:visible`).fill(String(v));
  ops++;
};
let fixups = [];
const box = async (zone, style, dir, prepend) => {
  const id = await add(zone, "Container (Box)", dir, prepend);
  for (const [k, v] of Object.entries(style)) {
    // 作っている間は既定の padding（8）を残し、最後に直す（padding 0 だと入れ子にドロップしにくい）
    if (k === "padding" && v === "") {
      fixups.push(id);
      continue;
    }
    await st(k, v);
  }
  return id;
};
async function fixPadding() {
  for (const id of fixups.reverse()) {
    const bb = await p
      .frameLocator("iframe")
      .locator(`[data-puck-component="${id}"]`)
      .boundingBox();
    await p.mouse.click(bb.x + 2, bb.y + 2);
    await p.waitForTimeout(250);
    await st("padding", "");
  }
  fixups = [];
}
const text = async (zone, t, variant, dir) => {
  const id = await add(zone, "Text", dir);
  await fill("text", t);
  if (variant) await sel("variant", variant);
  return id;
};
const button = async (zone, label, variant, dir) => {
  const id = await add(zone, "Button", dir);
  await fill("label", label);
  if (variant) await sel("variant", variant);
  return id;
};
async function newScreen(id, name) {
  await p.getByRole("button", { name: "＋ 新規" }).click();
  await p.getByLabel("種類").selectOption("screen");
  await p.getByLabel("id", { exact: true }).fill(id);
  await p.getByLabel("表示名").fill(name);
  await p.getByRole("button", { name: "作成", exact: true }).click();
  await p.waitForTimeout(1200);
  ops += 1;
}
const detail = async (obj) => {
  await p.locator('textarea[name="_p0"]:visible').fill(JSON.stringify(obj));
  ops++;
};
const nav = (to, params) => ({ type: "navigate", to, ...(params ? { params } : {}) });
const setS = (path) => ({ change: [{ type: "setState", path, value: "{{ event.value }}" }] });
async function columns(cols) {
  const af = p.locator("[class*=ArrayField]").filter({ visible: true }).first();
  for (let i = 0; i < cols.length; i++) {
    if (i >= 2) {
      await af.locator("button").last().click();
      ops++;
      await p.waitForTimeout(200);
    }
    const h = p.locator(`input[name="columns[${i}].header"]:visible`);
    if (!(await h.count())) {
      await af.locator("[class*=ArrayFieldItem-summary]").nth(i).click();
      ops++;
      await p.waitForTimeout(200);
    }
    await fill(`columns[${i}].header`, cols[i][0]);
    await fill(`columns[${i}].value`, cols[i][1]);
  }
}
const Z = (id) => `${id}:children`;
const R = "root:items";
const times = {};
let t = Date.now(),
  o = ops;
const lap = (k) => {
  times[k] = { ms: Date.now() - t, ops: ops - o };
  t = Date.now();
  o = ops;
};

// ---- S2 機器一覧 ----
await newScreen("devices2", "機器一覧（再作成）");
let h = await box(R, {
  flexDirection: "row",
  justifyContent: "space-between",
  alignItems: "center",
  gap: "",
  padding: "",
});
await text(Z(h), "機器一覧", "title", "row");
await button(Z(h), "ダッシュボードへ", "secondary", "row");
await detail({ events: { click: [nav("dashboard")] } });
await add(R, "Table");
await fill("rows", "{{ data.devices }}");
await columns([
  ["名前", "{{ row.name }}"],
  ["型番", "{{ row.model }}"],
  [
    "ステータス",
    "{{ ({ online: 'オンライン', offline: 'オフライン', warning: '警告' })[row.status] }}",
  ],
  ["IP アドレス", "{{ row.ipAddress }}"],
  ["ファームウェア", "{{ row.firmware }}"],
]);
await detail({ events: { rowClick: [nav("deviceSettings", { deviceId: "{{ event.row.id }}" })] } });
await fixPadding();
lap("S2");

// ---- S3 機器設定 ----
await newScreen("settings2", "機器設定（再作成）");
h = await box(R, { flexDirection: "row", alignItems: "center", gap: 12, padding: "" });
await text(
  Z(h),
  "{{ data.devices.find(d => d.id === params.deviceId)?.name ?? params.deviceId }} の設定",
  "title",
  "row",
);
await add(Z(h), "ステータスバッジ（StatusBadge）", "row");
await fill("status", "{{ data.devices.find(d => d.id === params.deviceId)?.status ?? 'offline' }}");
await text(R, "機器が見つかりません");
await detail({ visible: "{{ state.draftSettings === null }}" });
// 題材の form（visible 用のラッパー）は省く。入れ物の中に入れ物を並べるドロップが外側に落ちるため（README 参照）
const net = await box(R, { padding: "" });
await text(Z(net), "ネットワーク", "caption");
await add(Z(net), "Checkbox");
await fill("label", "DHCP を使う");
await fill("checked", "{{ state.draftSettings.network.dhcp }}");
await detail({ events: setS("draftSettings.network.dhcp") });
for (const [l, k] of [
  ["IP アドレス", "ip"],
  ["サブネットマスク", "subnet"],
  ["デフォルトゲートウェイ", "gateway"],
]) {
  await add(Z(net), "Input (TextInput)");
  await fill("label", l);
  await fill("value", `{{ state.draftSettings.network.${k} }}`);
  await fill("disabled", "{{ state.draftSettings.network.dhcp }}");
  await detail({ events: setS(`draftSettings.network.${k}`) });
}
const th = await box(R, { padding: "" });
await text(Z(th), "閾値", "caption");
for (const [l, k, max] of [
  ["温度の上限（℃）", "temperatureMax", 120],
  ["CPU 使用率の上限（%）", "cpuMax", 100],
]) {
  await add(Z(th), "NumberInput");
  await fill("label", l);
  await fill("value", `{{ state.draftSettings.thresholds.${k} }}`);
  await fill("min", 0);
  await fill("max", max);
  await detail({ events: setS(`draftSettings.thresholds.${k}`) });
}
const pl = await box(R, { padding: "" });
await text(Z(pl), "ポーリング", "caption");
await add(Z(pl), "NumberInput");
await fill("label", "ポーリング間隔（秒）");
await fill("value", "{{ state.draftSettings.pollingIntervalSec }}");
await fill("min", 10);
await fill("step", 10);
await detail({ events: setS("draftSettings.pollingIntervalSec") });
const bt = await box(R, { flexDirection: "row", justifyContent: "flex-end", padding: "" });
await button(Z(bt), "キャンセル", "secondary", "row");
await detail({ events: { click: [nav("devices")] } });
await button(Z(bt), "保存", "primary", "row");
await detail({
  events: {
    click: [
      { type: "openDialog", dialog: "saveConfirm", params: { deviceId: "{{ params.deviceId }}" } },
    ],
  },
});
await fixPadding();
lap("S3");

// ---- S1 ダッシュボード ----
await newScreen("dashboard2", "ダッシュボード（再作成）");
await st("gap", 24);
h = await box(R, {
  flexDirection: "row",
  justifyContent: "space-between",
  alignItems: "center",
  gap: "",
  padding: "",
});
await text(Z(h), "ダッシュボード", "title", "row");
await button(Z(h), "機器一覧へ", "secondary", "row");
await detail({ events: { click: [nav("devices")] } });
const ss = await box(R, { padding: "" });
await text(Z(ss), "機器ステータス", "caption");
const list = await box(Z(ss), { flexDirection: "row", flexWrap: "wrap", gap: 12, padding: "" });
const card = await box(
  Z(list),
  { gap: 4, padding: 12, width: 200, border: "1px solid #ddd", borderRadius: 8 },
  "row",
);
await detail({
  repeat: { each: "{{ data.devices }}", as: "device", key: "{{ device.id }}" },
  events: { click: [nav("deviceSettings", { deviceId: "{{ device.id }}" })] },
});
await text(Z(card), "{{ device.name }}");
await add(Z(card), "ステータスバッジ（StatusBadge）");
await fill("status", "{{ device.status }}");
const ms = await box(R, { flexDirection: "row", gap: 12, padding: "" });
const latest = (k) => `data.metrics.filter(m => m.deviceId === d.id).at(-1)?.${k}`;
for (const [l, v, u] of [
  ["最高温度", `{{ Math.max(...data.devices.map(d => ${latest("temperature")} ?? 0)) }}`, "℃"],
  ["最大 CPU 使用率", `{{ Math.max(...data.devices.map(d => ${latest("cpu")} ?? 0)) }}`, "%"],
  [
    "通信量（合計）",
    `{{ Math.round(data.devices.reduce((sum, d) => sum + (${latest("trafficMbps")} ?? 0), 0)) }}`,
    "Mbps",
  ],
]) {
  await add(Z(ms), "メトリクスカード（MetricCard）", "row");
  await fill("label", l);
  await fill("value", v);
  await fill("unit", u);
}
const as = await box(R, { padding: "" });
await text(Z(as), "最新アラーム", "caption");
await add(Z(as), "アラーム行（AlarmRow）");
await fill("alarm", "{{ alarm }}");
await fill(
  "deviceName",
  "{{ data.devices.find(d => d.id === alarm.deviceId)?.name ?? alarm.deviceId }}",
);
await detail({
  repeat: {
    each: "{{ data.alarms.toSorted((a, b) => b.occurredAt.localeCompare(a.occurredAt)).slice(0, 5) }}",
    as: "alarm",
    key: "{{ alarm.id }}",
  },
  events: {
    click: [{ type: "openDialog", dialog: "alarmDetail", params: { alarmId: "{{ alarm.id }}" } }],
  },
});
await fixPadding();
lap("S1");

const download = p.waitForEvent("download");
await p.getByRole("button", { name: "保存（ダウンロード）" }).click();
const saved = await (await download).createReadStream().then(async (stream) => {
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8");
});
await b.close();

const result = loadProject(saved, "yaml");
if (!result.success) throw new Error("保存したファイルが検証を通りません");
const project = result.project;

/** id を除いてノードを比べ、違う所をパスで返す。 */
const strip = (node) => {
  const { children, ...rest } = node;
  delete rest.id;
  return { ...rest, ...(children ? { children: children.map(strip) } : {}) };
};
const count = (n) => 1 + (n.children ?? []).reduce((a, c) => a + count(c), 0);
function diff(a, b, path, out) {
  if (JSON.stringify(a) === JSON.stringify(b)) return;
  if (
    a &&
    b &&
    typeof a === "object" &&
    typeof b === "object" &&
    Array.isArray(a) === Array.isArray(b)
  ) {
    for (const k of new Set([...Object.keys(a), ...Object.keys(b)]))
      diff(a[k], b[k], `${path}.${k}`, out);
    return;
  }
  out.push(`  ${path}: ${JSON.stringify(a)?.slice(0, 70)} → ${JSON.stringify(b)?.slice(0, 70)}`);
}
console.log("時間と操作数:", JSON.stringify(times));
console.log("合計操作数:", ops);
for (const [label, a, b] of [
  ["S1", "dashboard", "dashboard2"],
  ["S2", "devices", "devices2"],
  ["S3", "deviceSettings", "settings2"],
]) {
  const A = project.screens.find((s) => s.id === a).root;
  const B = project.screens.find((s) => s.id === b).root;
  const out = [];
  diff(strip(A), strip(B), "root", out);
  console.log(`${label}: ノード数 ${count(A)} → 作り直し ${count(B)}、違い ${out.length} 件`);
  if (out.length) console.log(out.join("\n"));
}
console.log(log.join("\n"));
if (errs.length) console.log("ページのエラー:", errs);
