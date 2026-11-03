import {
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { randomUUID } from "node:crypto";
import { formatIssue, loadProject, type Project } from "@ui-editor/poc-model";

/** 読み書きを root の中に限るファイルの入口。AI クライアントが渡すパスは、すべてここを通す。 */
export class Workspace {
  readonly root: string;

  constructor(root: string) {
    this.root = realpathSync(root);
  }

  /** root からの相対パス（または絶対パス）を解決する。シンボリックリンクをたどって root の外なら例外。 */
  resolve(path: string): string {
    const target = resolve(this.root, path);
    const missing: string[] = [];
    let existing = target;
    while (!isPresent(existing)) {
      missing.unshift(basename(existing));
      existing = dirname(existing);
    }
    const real = join(realpathSync(existing), ...missing);
    const rel = relative(this.root, real);
    if (rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel))
      throw new Error(`${path} は読み書きできる範囲（${this.root}）の外です`);
    return real;
  }

  /** プロジェクトファイルを読む。 */
  readProject(path: string): Project {
    const file = this.resolve(path);
    const result = loadProject(readFileSync(file, "utf8"));
    if (!result.success)
      throw new Error(`${path} を読めません:\n${result.issues.map(formatIssue).join("\n")}`);
    return result.project;
  }

  /** 一時ファイルに書いてから置き換える（途中で止まっても元のファイルが壊れない）。 */
  writeText(path: string, text: string): void {
    const file = this.resolve(path);
    mkdirSync(dirname(file), { recursive: true });
    const temp = `${file}.${randomUUID()}.tmp`;
    try {
      writeFileSync(temp, text);
      renameSync(temp, file);
    } finally {
      rmSync(temp, { force: true });
    }
  }

  exists(path: string): boolean {
    return existsSync(this.resolve(path));
  }

  /** フォルダが無いか空か。 */
  isEmptyDir(path: string): boolean {
    const dir = this.resolve(path);
    return !existsSync(dir) || readdirSync(dir).length === 0;
  }
}

/** リンク切れのシンボリックリンクも「ある」とする（先を確かめずに書き込まないため）。 */
function isPresent(path: string): boolean {
  try {
    lstatSync(path);
    return true;
  } catch {
    return false;
  }
}
