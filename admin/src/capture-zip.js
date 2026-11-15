// SPR-03: the ZIP of a capture's photos, made in the team's browser from the files the panel just downloaded (stored,
// no compression: photos are already compressed). The CRC-32 is worked out here, on the browser's CPU, never the
// Worker's. files: [{ name, bytes: Uint8Array }], with names the panel made.
const TABLE = Uint32Array.from({ length: 256 }, (_, n) => {
  for (let bit = 0; bit < 8; bit++) n = (n >>> 1) ^ ((n & 1) ? 0xedb88320 : 0);
  return n >>> 0;
});
export function crc32(b) {
  let crc = 0xffffffff;
  for (let i = 0; i < b.length; i++) crc = (crc >>> 8) ^ TABLE[(crc ^ b[i]) & 255];
  return (crc ^ 0xffffffff) >>> 0;
}
const field = (...parts) => {
  const out = new Uint8Array(parts.reduce((s, [size]) => s + size, 0)), v = new DataView(out.buffer);
  let p = 0;
  for (const [size, value] of parts) { if (size === 2) v.setUint16(p, value, true); else v.setUint32(p, value, true); p += size; }
  return out;
};
// 0x0800: UTF-8 names. Date: 1 Jan 2026, a fixed one.
const FLAGS = 0x0800, DATE = ((2026 - 1980) << 9) | (1 << 5) | 1;

export function zipBlob(files) {
  const parts = [], central = [];
  let offset = 0;
  for (const { name, bytes } of files) {
    const encoded = new TextEncoder().encode(name), crc = crc32(bytes);
    const common = [[2, 20], [2, FLAGS], [2, 0], [2, 0], [2, DATE], [4, crc], [4, bytes.length], [4, bytes.length], [2, encoded.length], [2, 0]];
    central.push(field([4, 0x02014b50], [2, 20], ...common, [2, 0], [2, 0], [2, 0], [4, 0], [4, offset]), encoded);
    const head = field([4, 0x04034b50], ...common);
    parts.push(head, encoded, bytes);
    offset += head.length + encoded.length + bytes.length;
  }
  const size = central.reduce((s, p) => s + p.length, 0);
  return new Blob([...parts, ...central, field([4, 0x06054b50], [2, 0], [2, 0], [2, files.length], [2, files.length], [4, size], [4, offset], [2, 0])],
    { type: "application/zip" });
}

const EXT = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif", "image/avif": "avif" };
const safeName = s => String(s ?? "").replace(/\.[A-Za-z0-9]{2,5}$/, "").replace(/[^A-Za-z0-9 _-]+/g, " ").trim().replace(/\s+/g, "-").slice(0, 60) || "photo";
// The name of one photo in the ZIP: its place in the capture and its label, never a path from a source.
export const entryName = a => `${String(a.n).padStart(2, "0")}-${safeName(a.label)}.${EXT[a.content_type] ?? "bin"}`;
