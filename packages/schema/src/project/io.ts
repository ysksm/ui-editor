import { parse as parseYaml, stringify as stringifyYaml, YAMLParseError } from "yaml";
import { validateProject, type ValidationResult } from "./validate.js";
import type { Project } from "./schema.js";

export type ProjectFormat = "json" | "yaml";

export class ProjectParseError extends Error {
  override name = "ProjectParseError";
}

/** ファイル名の拡張子から形式を決める。 */
export function formatFromPath(path: string): ProjectFormat {
  if (/\.json$/i.test(path)) return "json";
  if (/\.ya?ml$/i.test(path)) return "yaml";
  throw new ProjectParseError(`拡張子から形式を判定できません: ${path}`);
}

/** テキストを読み込んで生の値を返す（検証はしない）。 */
export function parseProjectText(text: string, format: ProjectFormat): unknown {
  if (format === "json") {
    try {
      return JSON.parse(text) as unknown;
    } catch (e) {
      throw new ProjectParseError(`JSON の構文エラー: ${(e as Error).message}`);
    }
  }
  const unquoted = findUnquotedBinding(text);
  if (unquoted !== undefined) {
    throw new ProjectParseError(
      `YAML ${unquoted} 行目: \`{{\` で始まる値はクォートしてください（例: "{{ device.name }}"）。` +
        "クォートしないと YAML のマッピングとして解釈されます",
    );
  }
  try {
    return parseYaml(text) as unknown;
  } catch (e) {
    if (e instanceof YAMLParseError) throw new ProjectParseError(`YAML の構文エラー: ${e.message}`);
    throw e;
  }
}

/** 読み込みと検証をまとめて行う。 */
export function loadProject(text: string, format: ProjectFormat): ValidationResult {
  return validateProject(parseProjectText(text, format));
}

/** 決定的に書き出す。同じ内容なら入力のキー順に関係なく同じテキストになる。 */
export function serializeProject(project: Project, format: ProjectFormat): string {
  const canonical = canonicalize(project);
  if (format === "json") return `${JSON.stringify(canonical, null, 2)}\n`;
  return stringifyYaml(canonical, {
    lineWidth: 0,
    aliasDuplicateObjects: false,
  });
}

/**
 * キーの並び順。ここに無いキーは後ろにアルファベット順で並べる。
 * 人が読みやすいよう、id や type を先頭、children や sampleData を末尾にしている。
 */
const KEY_ORDER = [
  "$schema",
  "schemaVersion",
  "id",
  "type",
  "name",
  "description",
  "entry",
  "path",
  "to",
  "dialog",
  "collection",
  "match",
  "set",
  "value",
  "default",
  "initial",
  "each",
  "as",
  "key",
  "params",
  "props",
  "style",
  "repeat",
  "visible",
  "events",
  "dataModel",
  "state",
  "screens",
  "components",
  "dialogs",
  "root",
  "children",
  "sampleData",
];
const KEY_RANK = new Map(KEY_ORDER.map((k, i) => [k, i]));

function compareKeys(a: string, b: string): number {
  const ra = KEY_RANK.get(a) ?? KEY_ORDER.length;
  const rb = KEY_RANK.get(b) ?? KEY_ORDER.length;
  if (ra !== rb) return ra - rb;
  return a < b ? -1 : a > b ? 1 : 0;
}

/** キーを KEY_ORDER → アルファベット順に並べ替え、undefined を取り除いた値を返す。 */
export function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value).sort(compareKeys)) {
      const v = (value as Record<string, unknown>)[key];
      if (v !== undefined) out[key] = canonicalize(v);
    }
    return out;
  }
  return value;
}

/** クォートされていない `{{` で始まる YAML の値を探し、その行番号（1 始まり）を返す。 */
function findUnquotedBinding(text: string): number | undefined {
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    if (/^\s*#/.test(line)) continue;
    if (/(^|:\s|-\s)\s*\{\{/.test(line)) return i + 1;
  }
  return undefined;
}
