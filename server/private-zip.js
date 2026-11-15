// SPR-03: a ZIP written as it is read (stored, no compression: photos are already compressed), one file at a time,
// so no package is held in memory whole. Each entry: { name, open: async () => ReadableStream | null }, with a name the
// server made. A file that cannot be opened errors the stream: the download fails rather than end as a ZIP missing it.
const CRC = Uint32Array.from({ length: 256 }, (_, n) => {
  for (let bit = 0; bit < 8; bit++) n = (n >>> 1) ^ ((n & 1) ? 0xedb88320 : 0);
  return n >>> 0;
});
const crc32 = (crc, b) => { for (let i = 0; i < b.length; i++) crc = (crc >>> 8) ^ CRC[(crc ^ b[i]) & 255]; return crc; };
const bytes = (...fields) => {
  const out = new Uint8Array(fields.reduce((s, [size]) => s + size, 0)), v = new DataView(out.buffer);
  let p = 0;
  for (const [size, value] of fields) { if (size === 2) v.setUint16(p, value, true); else v.setUint32(p, value, true); p += size; }
  return out;
};
const join = (...parts) => { const out = new Uint8Array(parts.reduce((s, p) => s + p.length, 0)); let p = 0; for (const x of parts) { out.set(x, p); p += x.length; } return out; };
// 0x0808: sizes and CRC in a descriptor after the data, and UTF-8 names. Date: 1 Jan 2026, a fixed one.
const FLAGS = 0x0808, TIME = 0, DATE = ((2026 - 1980) << 9) | (1 << 5) | 1;

export function streamZip(entries) {
  const central = [];
  let offset = 0, index = 0;
  return new ReadableStream({
    async pull(controller) {
      if (index === entries.length) {
        const dir = join(...central);
        controller.enqueue(join(dir, bytes([4, 0x06054b50], [2, 0], [2, 0], [2, entries.length], [2, entries.length], [4, dir.length], [4, offset], [2, 0])));
        controller.close();
        return;
      }
      const { name, open } = entries[index++], encoded = new TextEncoder().encode(name), start = offset;
      const body = await open();
      if (!body) throw new Error("A file of the ZIP is no longer stored");
      const head = join(bytes([4, 0x04034b50], [2, 20], [2, FLAGS], [2, 0], [2, TIME], [2, DATE], [4, 0], [4, 0], [4, 0], [2, encoded.length], [2, 0]), encoded);
      controller.enqueue(head);
      let crc = 0xffffffff, size = 0;
      const reader = (body instanceof ReadableStream ? body : new Response(body).body).getReader();
      for (let r; !(r = await reader.read()).done;) {
        const chunk = r.value instanceof Uint8Array ? r.value : new Uint8Array(r.value);
        crc = crc32(crc, chunk); size += chunk.length;
        controller.enqueue(chunk);
      }
      crc = (crc ^ 0xffffffff) >>> 0;
      controller.enqueue(bytes([4, 0x08074b50], [4, crc], [4, size], [4, size]));
      offset += head.length + size + 16;
      central.push(join(bytes([4, 0x02014b50], [2, 20], [2, 20], [2, FLAGS], [2, 0], [2, TIME], [2, DATE], [4, crc], [4, size], [4, size],
        [2, encoded.length], [2, 0], [2, 0], [2, 0], [2, 0], [4, 0], [4, start]), encoded));
    },
  });
}
