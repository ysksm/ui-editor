/**
 * ステップ 1 の完了条件の QA（#102）:
 * 「題材の 3 画面・2 ダイアログと遷移を、ゼロから 5 分程度で作って保存し、開き直せる」
 *
 * 空のプロジェクトから、画面の操作だけで 3 画面・2 ダイアログを作り、フロー図のドラッグで遷移 7 本を引き、
 * 保存して開き直す。人が行う操作（クリック・入力・ドラッグ）の数を数え、かかる時間の目安にする。
 *
 *   pnpm --filter "./original-poc/**" build
 *   pnpm --filter @ui-editor/poc-app qa:step1
 */
import { readFileSync, writeFileSync } from "node:fs";
import { extractTransitions, formatIssue, loadProject } from "@ui-editor/poc-model";
import {
  buildDeviceFlow,
  checklist,
  DEVICE_TRANSITIONS as TRANSITIONS,
  ensurePreview,
  openEditor,
  OUT_DIR,
} from "./lib.mjs";

const stop = await ensurePreview();
const { browser, page: p, errors } = await openEditor();
const qa = checklist();
const started = Date.now();
let ops = 0; // 人が行う操作（クリック・入力の確定・ドラッグ）の数
const nav = p.getByRole("navigation", { name: "ビュー" });

try {
  ops += await buildDeviceFlow(p);
  const listed = await p
    .getByRole("navigation", { name: "画面とダイアログ" })
    .getByRole("button")
    .allTextContents();
  qa.check("一覧に 3 画面・2 ダイアログ", listed.length === 5, listed.join(" / "));
  qa.check("フロー図に遷移の線が 7 本", (await p.locator(".react-flow__edge").count()) === 7);
  qa.check(
    "ダイアログの呼び出し（破線）が 2 本",
    (await p.locator("path.flow-edge-dialog").count()) === 2,
  );
  qa.check(
    "仮の部品のラベルが 7 つ",
    (await p.locator(".flow-edge-label.placeholder").count()) === 7,
  );
  const badge = await p.getByRole("button", { name: /^検証:/ }).innerText();
  // 遷移はまだ仮のボタンなので、「仮の部品のままの遷移」の警告が 7 件出るのが正しい
  qa.check(
    "検証のエラー 0 件・警告は仮の部品のままの遷移 7 件",
    badge.trim() === "エラー 0・警告 7",
    badge,
  );
  await p.screenshot({ path: `${OUT_DIR}step1-flow.png` });

  // ---- 保存して中身を確かめる ----
  const [download] = await Promise.all([
    p.waitForEvent("download"),
    p.getByRole("button", { name: "保存", exact: true }).click(),
  ]);
  ops++;
  const savedPath = `${OUT_DIR}step1.poc.json`;
  await download.saveAs(savedPath);
  const loaded = loadProject(readFileSync(savedPath, "utf8"));
  qa.check("保存したファイルを読み込める", loaded.success);
  if (loaded.success) {
    const errors = loaded.issues.filter((i) => i.severity === "error");
    const placeholders = loaded.issues.filter((i) => /仮の部品「.+」のままの遷移/.test(i.message));
    qa.check(
      "保存したファイル: エラー 0 件、警告は仮の部品のままの遷移 7 件だけ",
      errors.length === 0 && placeholders.length === 7 && loaded.issues.length === 7,
      errors.map(formatIssue).join("\n"),
    );
    const pairs = extractTransitions(loaded.project).map((t) => `${t.from}→${t.to}`);
    qa.check(
      "保存したファイルの遷移が題材と同じ 7 本",
      JSON.stringify([...pairs].sort()) ===
        JSON.stringify(TRANSITIONS.map(([a, b]) => `${a}→${b}`).sort()),
      pairs.join(", "),
    );
    const kinds = extractTransitions(loaded.project).map((t) => t.kind);
    qa.check(
      "ダイアログ宛ては openDialog、画面宛ては navigate",
      kinds.filter((k) => k === "openDialog").length === 2,
    );
    qa.check(
      "遷移は仮のボタン（placeholder）",
      extractTransitions(loaded.project).every((t) => t.placeholder && t.nodeType === "Button"),
    );
    qa.check(
      "配置（layout.flow）が保存されている",
      Object.keys(loaded.project.layout?.flow ?? {}).length === 5,
    );
  }

  // ---- 開き直す ----
  await p.getByRole("button", { name: "新規", exact: true }).click();
  const [chooser] = await Promise.all([
    p.waitForEvent("filechooser"),
    p.getByRole("button", { name: "開く", exact: true }).click(),
  ]);
  await chooser.setFiles(savedPath);
  await p.waitForTimeout(400);
  await nav.getByRole("button", { name: "フロー" }).click();
  await p.waitForTimeout(300);
  qa.check(
    "開き直すとノード 5・遷移 7",
    (await p.locator(".react-flow__node").count()) === 5 &&
      (await p.locator(".react-flow__edge").count()) === 7,
  );
  qa.check("ページのエラーが無い", errors.length === 0, errors.join("\n"));
} catch (e) {
  qa.check("例外なく最後まで動く", false, e.stack ?? e);
  await p.screenshot({ path: `${OUT_DIR}step1-error.png` }).catch(() => {});
} finally {
  const seconds = Math.round((Date.now() - started) / 1000);
  // 人の操作 1 回あたり 5〜10 秒として、かかる時間を見積もる
  const estimate = `${Math.round((ops * 5) / 60)}〜${Math.round((ops * 10) / 60)} 分`;
  qa.check("人が行う操作の数（目安: 1 回 5〜10 秒）", ops <= 40, `${ops} 回 → ${estimate}`);
  writeFileSync(
    `${OUT_DIR}step1.json`,
    `${JSON.stringify({ seconds, ops, estimate, items: qa.items }, null, 2)}\n`,
  );
  console.log(
    `\n${qa.items.length - qa.failed.length}/${qa.items.length} OK（自動操作 ${seconds} 秒、人の操作 ${ops} 回 ≒ ${estimate}）`,
  );
  await browser.close();
  stop();
}
process.exit(qa.failed.length === 0 ? 0 : 1);
