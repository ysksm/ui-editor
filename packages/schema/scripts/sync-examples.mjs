// examples/*.source.yaml にサンプルデータを入れ、正規化した YAML / JSON を書き出す。
import { readFileSync, writeFileSync } from "node:fs";
import { buildDeviceMonitorProject, DEVICE_MONITOR_EXAMPLE } from "../dist/examples.js";
import { serializeProject } from "../dist/index.js";

const dir = new URL("../examples/", import.meta.url);
const project = buildDeviceMonitorProject(
  readFileSync(new URL(DEVICE_MONITOR_EXAMPLE.source, dir), "utf8"),
);
for (const [format, file] of Object.entries(DEVICE_MONITOR_EXAMPLE.outputs)) {
  writeFileSync(new URL(file, dir), serializeProject(project, format));
  console.log(`wrote examples/${file}`);
}
