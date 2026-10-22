import type { Project } from "@ui-editor/poc-model";
import exampleText from "../../examples/device-monitor.poc.json?raw";
import { parseProjectFile } from "./state/files";

export const EXAMPLE_FILE_NAME = "device-monitor.poc.json";

/** 題材「機器の設定＆モニタリング」。 */
export function loadExample(): Project {
  return parseProjectFile(exampleText);
}
