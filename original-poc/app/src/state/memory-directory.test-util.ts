import type { WritableDirectory } from "./code-export";

/** メモリの中のフォルダ（showDirectoryPicker の代わり）。 */
export function memoryDirectory(name = "out") {
  const files = new Map<string, string>();
  const make = (prefix: string, dirName: string): WritableDirectory => ({
    name: dirName,
    getDirectoryHandle: async (n) => make(`${prefix}${n}/`, n),
    getFileHandle: async (n) => ({
      createWritable: async () => {
        let text = "";
        return {
          write: async (data: string) => void (text += data),
          close: async () => void files.set(`${prefix}${n}`, text),
        };
      },
    }),
    async *values() {
      for (const k of files.keys()) if (k.startsWith(prefix)) yield k;
    },
  });
  return { dir: make("", name), files };
}
