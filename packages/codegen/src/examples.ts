import { fileURLToPath } from "node:url";

/** 生成を確かめる題材。スナップショットテストと build:examples で使う。 */
export const EXAMPLES = [
  {
    name: "hello",
    file: fileURLToPath(new URL("../fixtures/hello.project.yaml", import.meta.url)),
  },
  {
    name: "device-monitor",
    file: fileURLToPath(
      new URL("../../schema/examples/device-monitor.project.yaml", import.meta.url),
    ),
  },
] as const;
