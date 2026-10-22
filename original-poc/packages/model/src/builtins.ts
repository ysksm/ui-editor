import type { BuiltinNodeType } from "./schema.js";

/** 組み込みのノードが発火するイベント。 */
export const NODE_EVENTS: Record<BuiltinNodeType, readonly string[]> = {
  Box: ["click"],
  Text: ["click"],
  Button: ["click"],
  TextInput: ["change"],
  NumberInput: ["change"],
  Checkbox: ["change"],
  Select: ["change"],
  Table: ["rowClick", "rowSelect"],
};

/** `Button.requires` の `selection.<Entity>` 形式。 */
export const SELECTION_PATH = /^selection\.([A-Z][A-Za-z0-9]*)$/;

/** `state` の予約語（ランタイムが管理する）。 */
export const RESERVED_STATE_KEYS = ["selection"] as const;
