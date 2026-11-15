// SPR-03: a ZIP written as it is read (stored, no compression: photos are already compressed). Each entry is
// { name, size, crc, body }: a name the server made, the size and CRC-32 worked out when the file was checked
// (server/property-captures.js) and the body already opened, so nothing missing is found after the answer starts.
// No loop over bytes: headers carry the stored CRC and each body is passed on one chunk per read, as the reader asks.
// A body longer or shorter than its size errors the stream, so the download fails instead of ending as a broken ZIP.
const field = (...parts) => {
  const out = new Uint8Array(parts.reduce((s, [size]) => s + size, 0)), v = new DataView(out.buffer);
  let p = 0;
  for (const [size, value] of parts) { if (size === 2) v.setUint16(p, value, true); else v.setUint32(p, value, true); p += size; }
  return out;
};
const join = (a, b) => { const out = new Uint8Array(a.length + b.length); out.set(a); out.set(b, a.length); return out; };
// 0x0800: UTF-8 names. Date: 1 Jan 2026, a fixed one.
const FLAGS = 0x0800, DATE = ((2026 - 1980) << 9) | (1 << 5) | 1;
const stream = body => (body instanceof ReadableStream ? body : new Response(body).body);

export function streamZip(entries) {
  const central = [], names = entries.map(e => new TextEncoder().encode(e.name));
  let index = 0, offset = 0, reader = null, sent = 0, closed = false;
  return new ReadableStream({
    async pull(controller) {
      for (;;) {
        if (reader) {
          const r = await reader.read();
          if (!r.done) {
            sent += r.value.byteLength;
            if (sent > entries[index - 1].size) throw new Error("A file of the ZIP changed while it was sent");
            controller.enqueue(r.value);
            return;
          }
          if (sent !== entries[index - 1].size) throw new Error("A file of the ZIP changed while it was sent");
          reader = null;
        }
        if (index < entries.length) {
          const { size, crc, body } = entries[index], name = names[index++];
          const common = [[2, 20], [2, FLAGS], [2, 0], [2, 0], [2, DATE], [4, crc], [4, size], [4, size], [2, name.length], [2, 0]];
          central.push(join(field([4, 0x02014b50], [2, 20], ...common, [2, 0], [2, 0], [2, 0], [4, 0], [4, offset]), name));
          const head = join(field([4, 0x04034b50], ...common), name);
          offset += head.length + size;
          reader = stream(body).getReader(); sent = 0;
          controller.enqueue(head);
          return;
        }
        if (closed) return;
        const dir = central.reduce(join, new Uint8Array(0));
        controller.enqueue(join(dir, field([4, 0x06054b50], [2, 0], [2, 0], [2, entries.length], [2, entries.length], [4, dir.length], [4, offset], [2, 0])));
        controller.close(); closed = true;
        return;
      }
    },
    async cancel(reason) {
      await reader?.cancel(reason);
      await Promise.all(entries.slice(index).map(e => stream(e.body).cancel(reason).catch(() => {})));
    },
  }, { highWaterMark: 0 });
}
