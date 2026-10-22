/**
 * ファイルを zip（無圧縮）にまとめる。コードの書き出しで File System Access API が無いときに使う。
 * 日時は固定（1980-01-01）なので、同じ中身なら同じ zip になる。
 */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

export function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (const b of bytes) c = CRC_TABLE[(c ^ b) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** DOS 形式の日付（1980-01-01）。 */
const DOS_DATE = (0 << 9) | (1 << 5) | 1;
/** 汎用フラグ: ファイル名は UTF-8。 */
const UTF8 = 0x0800;

export function zip(files: readonly { path: string; content: string }[]): Uint8Array<ArrayBuffer> {
  const encoder = new TextEncoder();
  const chunks: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  for (const f of files) {
    const name = encoder.encode(f.path);
    const data = encoder.encode(f.content);
    const crc = crc32(data);
    const local = header(30 + name.length, (v) => {
      v.setUint32(0, 0x04034b50, true);
      v.setUint16(4, 20, true);
      v.setUint16(6, UTF8, true);
      v.setUint16(8, 0, true);
      v.setUint16(10, 0, true);
      v.setUint16(12, DOS_DATE, true);
      v.setUint32(14, crc, true);
      v.setUint32(18, data.length, true);
      v.setUint32(22, data.length, true);
      v.setUint16(26, name.length, true);
      v.setUint16(28, 0, true);
    });
    local.set(name, 30);
    const entry = header(46 + name.length, (v) => {
      v.setUint32(0, 0x02014b50, true);
      v.setUint16(4, 20, true);
      v.setUint16(6, 20, true);
      v.setUint16(8, UTF8, true);
      v.setUint16(10, 0, true);
      v.setUint16(12, 0, true);
      v.setUint16(14, DOS_DATE, true);
      v.setUint32(16, crc, true);
      v.setUint32(20, data.length, true);
      v.setUint32(24, data.length, true);
      v.setUint16(28, name.length, true);
      v.setUint32(42, offset, true);
    });
    entry.set(name, 46);
    chunks.push(local, data);
    central.push(entry);
    offset += local.length + data.length;
  }
  const size = central.reduce((n, c) => n + c.length, 0);
  const end = header(22, (v) => {
    v.setUint32(0, 0x06054b50, true);
    v.setUint16(8, files.length, true);
    v.setUint16(10, files.length, true);
    v.setUint32(12, size, true);
    v.setUint32(16, offset, true);
  });
  const all = [...chunks, ...central, end];
  const out = new Uint8Array(all.reduce((n, c) => n + c.length, 0));
  let at = 0;
  for (const c of all) {
    out.set(c, at);
    at += c.length;
  }
  return out;
}

function header(length: number, write: (view: DataView) => void): Uint8Array {
  const bytes = new Uint8Array(length);
  write(new DataView(bytes.buffer));
  return bytes;
}
