import { createEmptyProject } from "@ui-editor/poc-model";
import { describe, expect, it } from "vitest";
import { loadExample } from "../example";
import { HISTORY_LIMIT } from "./history";
import { createEditorStore } from "./store";

describe("エディタのストア", () => {
  it("編集すると履歴に積み、Undo / Redo で戻せる", () => {
    const store = createEditorStore({ project: loadExample() });
    const original = store.getState().project;
    store.getState().edit("名前を変更", (d) => void (d.name = "A"));
    store.getState().edit("説明を変更", (d) => void (d.description = "B"));
    expect(store.getState().project).toMatchObject({ name: "A", description: "B" });
    expect(store.getState().dirty).toBe(true);
    expect(store.getState().history.past.map((e) => e.label)).toEqual(["名前を変更", "説明を変更"]);

    store.getState().undo();
    store.getState().undo();
    expect(store.getState().project).toEqual(original);
    expect(store.getState().history.future.map((e) => e.label)).toEqual([
      "名前を変更",
      "説明を変更",
    ]);
    store.getState().redo();
    expect(store.getState().project.name).toBe("A");
    // 新しい編集でやり直しの履歴は消える
    store.getState().edit("名前を変更", (d) => void (d.name = "C"));
    expect(store.getState().history.future).toEqual([]);
  });

  it("何も変わらない編集は履歴に積まない", () => {
    const store = createEditorStore({ project: loadExample() });
    store.getState().edit("何もしない", () => {});
    expect(store.getState().history.past).toEqual([]);
    expect(store.getState().dirty).toBe(false);
  });

  it(`履歴は ${HISTORY_LIMIT} 件まで`, () => {
    const store = createEditorStore({ project: createEmptyProject() });
    for (let i = 0; i < HISTORY_LIMIT + 5; i++)
      store.getState().edit(`${i}`, (d) => void (d.name = `n${i}`));
    expect(store.getState().history.past).toHaveLength(HISTORY_LIMIT);
    expect(store.getState().history.past[0]!.label).toBe("5");
  });

  it("編集のたびに検証し直す", () => {
    const store = createEditorStore({ project: loadExample() });
    expect(store.getState().issues).toEqual([]);
    store.getState().edit("entry を壊す", (d) => void (d.entry = "nowhere"));
    expect(store.getState().issues.map((i) => i.path)).toEqual([["entry"]]);
    store.getState().undo();
    expect(store.getState().issues).toEqual([]);
  });

  it("プロジェクトを入れ替えると履歴と選択を消す", () => {
    const store = createEditorStore({ project: loadExample() });
    store.getState().edit("x", (d) => void (d.name = "x"));
    store.getState().select({ kind: "entity", id: "Device" });
    store.getState().replaceProject(createEmptyProject(), null);
    expect(store.getState()).toMatchObject({ dirty: false, selection: null, file: null });
    expect(store.getState().history.past).toEqual([]);
  });

  it("未保存の変更があるときだけ確認を出す", () => {
    const store = createEditorStore({ project: loadExample() });
    let done = 0;
    store.getState().confirmDiscard("破棄？", "破棄", () => done++);
    expect(done).toBe(1);
    store.getState().edit("x", (d) => void (d.name = "x"));
    store.getState().confirmDiscard("破棄？", "破棄", () => done++);
    expect(done).toBe(1);
    expect(store.getState().confirm?.text).toBe("破棄？");
    store.getState().confirm!.onOk();
    expect(done).toBe(2);
  });
});
