// ビルド済みの dist から project.schema.json を書き出す。
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { serializeJsonSchema } from "../dist/index.js";

const out = fileURLToPath(new URL("../project.schema.json", import.meta.url));
writeFileSync(out, serializeJsonSchema());
console.log(`wrote ${out}`);
