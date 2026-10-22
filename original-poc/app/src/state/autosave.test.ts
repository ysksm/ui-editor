import { createEmptyProject, loadProject } from "@ui-editor/poc-model";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AUTOSAVE_KEY, clearAutosave, readAutosave, startAutosave } from "./autosave";
import { createEditorStore } from "./store";

function memoryStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
    map,
  };
}

describe("自動保存", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("編集して少し待つと保存し、読み戻せる", () => {
    const storage = memoryStorage();
    const store = createEditorStore({
      project: createEmptyProject(),
      file: { name: "a.poc.json" },
    });
    const stop = startAutosave(store, storage, 500, () => new Date("2026-10-23T00:00:00Z"));
    store.getState().edit("名前", (d) => void (d.name = "保存される"));
    expect(storage.map.has(AUTOSAVE_KEY)).toBe(false);
    vi.advanceTimersByTime(500);
    const saved = readAutosave(storage);
    expect(saved).toMatchObject({
      fileName: "a.poc.json",
      dirty: true,
      savedAt: "2026-10-23T00:00:00.000Z",
    });
    const loaded = loadProject(saved!.text);
    expect(loaded.success && loaded.project.name).toBe("保存される");
    stop();
  });

  it("止めるときに保留中の保存を書き出す", () => {
    const storage = memoryStorage();
    const store = createEditorStore({ project: createEmptyProject() });
    const stop = startAutosave(store, storage);
    store.getState().edit("名前", (d) => void (d.name = "x"));
    stop();
    expect(readAutosave(storage)).not.toBeNull();
  });

  it("壊れた内容・無い内容は null", () => {
    const storage = memoryStorage();
    expect(readAutosave(storage)).toBeNull();
    storage.setItem(AUTOSAVE_KEY, "{");
    expect(readAutosave(storage)).toBeNull();
    clearAutosave(storage);
    expect(storage.map.size).toBe(0);
    expect(readAutosave(undefined)).toBeNull();
  });
});
