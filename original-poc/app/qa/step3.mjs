/**
 * ステップ 3 の完了条件の QA（#93）:
 * 「Device / Alarm / Metric / DeviceSettings の ER を作り、機器 5 件・アラーム 20 件を、
 *   入れ子と参照が壊れていない状態で生成できる」
 *
 * 空のプロジェクトから、画面の操作だけで ER を作り、サンプルデータを生成して保存し、開き直す。
 *
 *   pnpm --filter "./original-poc/**" build
 *   pnpm --filter @ui-editor/poc-app qa:step3      # vite preview が無ければ起動する
 */
import { readFileSync, writeFileSync } from "node:fs";
import { formatIssue, loadProject, walkData } from "@ui-editor/poc-model";
import { checklist, commit, ensurePreview, openEditor, OUT_DIR } from "./lib.mjs";

const ENTITIES = [
  {
    id: "Device",
    name: "機器",
    fields: [
      { id: "name", name: "名前", type: "string", required: true },
      { id: "status", name: "状態", type: "enum", values: "online, offline, warning" },
      { id: "ipAddress", name: "IP アドレス", type: "string", format: "ipv4" },
    ],
  },
  {
    id: "Alarm",
    name: "アラーム",
    fields: [
      { id: "level", name: "レベル", type: "enum", values: "info, warn, error", required: true },
      { id: "message", name: "内容", type: "string", required: true },
      { id: "acknowledged", name: "確認済み", type: "boolean" },
    ],
  },
  {
    id: "Metric",
    name: "メトリクス",
    fields: [
      { id: "timestamp", name: "日時", type: "date", format: "datetime" },
      { id: "cpu", name: "CPU 使用率", type: "number", min: "0", max: "100" },
    ],
  },
  {
    id: "DeviceSettings",
    name: "機器設定",
    fields: [
      { id: "dhcp", name: "DHCP", type: "boolean" },
      { id: "pollingIntervalSec", name: "ポーリング間隔", type: "number", min: "5", max: "3600" },
    ],
  },
];

const stop = await ensurePreview();
const { browser, page: p, errors } = await openEditor();
const qa = checklist();
const started = Date.now();
const nav = p.getByRole("navigation", { name: "ビュー" });

try {
  // ---- 空のプロジェクトから ----
  await p.getByRole("button", { name: "新規", exact: true }).click();
  await commit(p, "プロジェクト名", "QA ステップ 3");
  await nav.getByRole("button", { name: "ER" }).click();

  // ---- エンティティと属性 ----
  for (const e of ENTITIES) {
    await p.getByRole("button", { name: "＋ エンティティ" }).click();
    await commit(p, "エンティティの名前", e.name);
    await commit(p, "エンティティの id", e.id);
    for (const f of e.fields) {
      await p.getByRole("button", { name: "＋ 属性" }).click();
      await commit(p, "属性 field1 の id", f.id);
      await commit(p, `属性 ${f.id} の名前`, f.name);
      await p.getByLabel(`属性 ${f.id} の型`, { exact: true }).selectOption(f.type);
      if (f.required) await p.getByLabel(`属性 ${f.id} は必須`, { exact: true }).check();
      if (f.values) await commit(p, `属性 ${f.id} の値`, f.values);
      if (f.format)
        await p.getByLabel(`属性 ${f.id} の書式`, { exact: true }).selectOption(f.format);
      if (f.min) await commit(p, `属性 ${f.id} の最小値`, f.min);
      if (f.max) await commit(p, `属性 ${f.id} の最大値`, f.max);
    }
  }
  qa.check(
    "4 つのエンティティが ER 図に描かれる",
    (await p.locator(".react-flow__node").count()) === 4,
    await p.locator(".er-node-head strong").allTextContents(),
  );

  // ---- 関係: パネルから 2 つ、ER 図のドラッグで 1 つ ----
  const selectEntity = (id) => p.locator(`.react-flow__node[data-id=${id}] .er-node-head`).click();
  const addRelation = async (kind, to) => {
    await p.getByLabel("関係の種類", { exact: true }).selectOption({ label: kind });
    await p.getByLabel("関係の相手", { exact: true }).selectOption(to);
    await p.getByRole("button", { name: "追加", exact: true }).click();
  };
  await p.getByRole("button", { name: "整列" }).click();
  await selectEntity("Device");
  await addRelation("1 対多（入れ子）", "Alarm");
  await selectEntity("Device");
  await addRelation("1 対 1（入れ子）", "DeviceSettings");

  const from = await p
    .locator(".react-flow__node[data-id=Device] .react-flow__handle-right")
    .boundingBox();
  const to = await p
    .locator(".react-flow__node[data-id=Metric] .react-flow__handle-left")
    .boundingBox();
  await p.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await p.mouse.down();
  await p.mouse.move(to.x - 30, to.y + to.height / 2, { steps: 12 });
  await p.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 4 });
  await p.mouse.up();
  await p.getByRole("button", { name: /1 対多（入れ子）/ }).click();
  await p.getByRole("button", { name: "整列" }).click();
  await p.waitForTimeout(300);

  const deviceFields = await p
    .locator(".react-flow__node[data-id=Device] .er-field-id")
    .allTextContents();
  qa.check(
    "関係: Device に alarms / deviceSettings / metrics（入れ子）ができる",
    ["alarms", "deviceSettings", "metrics"].every((f) => deviceFields.some((t) => t.includes(f))),
    deviceFields.join(", "),
  );
  qa.check("ER 図の線（入れ子）が 3 本", (await p.locator("path.er-edge-nest").count()) === 3);
  await p.screenshot({ path: `${OUT_DIR}step3-er.png` });

  // ---- サンプルデータの生成 ----
  await nav.getByRole("button", { name: "データ" }).click();
  await p.getByRole("button", { name: "サンプルデータを生成…" }).click();
  const dialog = p.getByRole("dialog", { name: "サンプルデータの生成" });
  await dialog.getByLabel("機器の件数").fill("5");
  await dialog.getByLabel("アラームの件数").fill("20");
  await dialog.getByRole("button", { name: "生成して置き換える" }).click();
  const tree = (
    await p.getByRole("navigation", { name: "エンティティ" }).getByRole("button").allTextContents()
  ).map((t) => t.replace(/[\s└]+/g, ""));
  qa.check(
    "生成後の件数（機器 5・アラーム 20）",
    tree.includes("機器5") && tree.some((t) => /アラーム20$/.test(t)),
    tree.join(" / "),
  );
  const badge = await p.getByRole("button", { name: /^検証:/ }).innerText();
  qa.check("検証の問題が 0 件", badge.trim() === "エラー 0・警告 0", badge);
  await p
    .getByRole("navigation", { name: "エンティティ" })
    .getByRole("button", { name: /アラーム/ })
    .click();
  await p.screenshot({ path: `${OUT_DIR}step3-data.png` });

  await p.getByRole("button", { name: "入れ子の木" }).click();
  const alarmCounts = await p
    .locator(".nested-tree .tree-field-name")
    .filter({ hasText: "アラーム" })
    .allTextContents();
  qa.check(
    "入れ子の木: どの機器にもアラームがある",
    alarmCounts.length === 5 && alarmCounts.every((t) => !/（0）/.test(t)),
    alarmCounts.join(" "),
  );
  await p
    .locator(".nested-tree details")
    .first()
    .evaluate((d) => (d.open = true));
  await p.screenshot({ path: `${OUT_DIR}step3-tree.png` });

  // ---- 保存（ダウンロード）して中身を確かめる ----
  const [download] = await Promise.all([
    p.waitForEvent("download"),
    p.getByRole("button", { name: "保存", exact: true }).click(),
  ]);
  const savedPath = `${OUT_DIR}step3.poc.json`;
  await download.saveAs(savedPath);
  const loaded = loadProject(readFileSync(savedPath, "utf8"));
  qa.check("保存したファイルを読み込める", loaded.success);
  if (loaded.success) {
    qa.check(
      "保存したファイルの検証の問題が 0 件",
      loaded.issues.length === 0,
      loaded.issues.map(formatIssue).join("\n"),
    );
    const counts = {};
    let orphanAlarms = 0;
    walkData(loaded.project, ({ entity, parent }) => {
      counts[entity.id] = (counts[entity.id] ?? 0) + 1;
      if (entity.id === "Alarm" && parent?.entity.id !== "Device") orphanAlarms++;
    });
    qa.check(
      "保存した件数（入れ子）",
      counts.Device === 5 &&
        counts.Alarm === 20 &&
        counts.DeviceSettings === 5 &&
        counts.Metric === 15,
      JSON.stringify(counts),
    );
    qa.check("アラームはすべて機器の下にある", orphanAlarms === 0);
    qa.check("data の直下は Device だけ", Object.keys(loaded.project.data).join() === "Device");
  }

  // ---- 開き直す ----
  await p.getByRole("button", { name: "新規", exact: true }).click();
  const [chooser] = await Promise.all([
    p.waitForEvent("filechooser"),
    p.getByRole("button", { name: "開く", exact: true }).click(),
  ]);
  await chooser.setFiles(savedPath);
  await p.waitForTimeout(300);
  qa.check(
    "開き直すとプロジェクト名が戻る",
    (await p.getByLabel("プロジェクト名").inputValue()) === "QA ステップ 3",
  );
  await nav.getByRole("button", { name: "ER" }).click();
  qa.check(
    "開き直すと ER 図に 4 つのエンティティ",
    (await p.locator(".react-flow__node").count()) === 4,
  );
  qa.check("ページのエラーが無い", errors.length === 0, errors.join("\n"));
} catch (e) {
  qa.check("例外なく最後まで動く", false, e.stack ?? e);
  await p.screenshot({ path: `${OUT_DIR}step3-error.png` }).catch(() => {});
} finally {
  const seconds = Math.round((Date.now() - started) / 1000);
  writeFileSync(
    `${OUT_DIR}step3.json`,
    `${JSON.stringify({ seconds, items: qa.items }, null, 2)}\n`,
  );
  console.log(`\n${qa.items.length - qa.failed.length}/${qa.items.length} OK（${seconds} 秒）`);
  await browser.close();
  stop();
}
process.exit(qa.failed.length === 0 ? 0 : 1);
