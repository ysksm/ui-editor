import { describe, expect, it } from "vitest";
import { crc32, zip } from "./zip";

const bytes = (s: string) => new TextEncoder().encode(s);

describe("zip", () => {
  it("CRC32（既知の値）", () => {
    expect(crc32(bytes(""))).toBe(0);
    expect(crc32(bytes("123456789"))).toBe(0xcbf43926);
    expect(crc32(bytes("hello"))).toBe(0x3610a686);
  });

  it("無圧縮の zip: ローカルヘッダー・セントラルディレクトリ・終端。同じ中身なら同じバイト列", () => {
    const files = [
      { path: "app/package.json", content: "{}\n" },
      { path: "app/src/画面.tsx", content: "export {};\n" },
    ];
    const out = zip(files);
    const view = new DataView(out.buffer);
    expect(view.getUint32(0, true)).toBe(0x04034b50);
    const end = out.length - 22;
    expect(view.getUint32(end, true)).toBe(0x06054b50);
    expect(view.getUint16(end + 10, true)).toBe(2);
    const cd = view.getUint32(end + 16, true);
    expect(view.getUint32(cd, true)).toBe(0x02014b50);
    const nameLength = view.getUint16(cd + 28, true);
    expect(new TextDecoder().decode(out.slice(cd + 46, cd + 46 + nameLength))).toBe(
      "app/package.json",
    );
    // 1 つ目のファイルの中身はローカルヘッダーの直後
    const first = 30 + view.getUint16(26, true);
    expect(new TextDecoder().decode(out.slice(first, first + 3))).toBe("{}\n");
    expect(zip(files)).toEqual(out);
  });
});
