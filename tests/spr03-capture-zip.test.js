// SPR-03: the ZIP the panel makes in the browser. Synthetic bytes only.
import test from "node:test";
import assert from "node:assert/strict";
import { crc32 as zlibCrc } from "node:zlib";
import { randomBytes } from "node:crypto";
import { crc32, zipBlob, entryName } from "../admin/src/capture-zip.js";

test("the CRC-32 is the standard one and each entry carries it with its bytes", async () => {
  const files = [{ name: "01-Kitchen.jpg", bytes: new Uint8Array(randomBytes(70000)) }, { name: "02-Café.png", bytes: new Uint8Array([1, 2, 3]) }];
  for (const f of files) assert.equal(crc32(f.bytes), zlibCrc(f.bytes));
  const b = Buffer.from(await zipBlob(files).arrayBuffer()), seen = [];
  let p = 0;
  while (b.readUInt32LE(p) === 0x04034b50) {
    const size = b.readUInt32LE(p + 18), len = b.readUInt16LE(p + 26), start = p + 30 + len;
    seen.push(b.subarray(p + 30, start).toString());
    assert.equal(b.readUInt32LE(p + 14), zlibCrc(b.subarray(start, start + size)));
    p = start + size;
  }
  assert.deepEqual(seen, files.map(f => f.name));
  const end = b.length - 22;
  assert.equal(b.readUInt32LE(end), 0x06054b50);
  assert.equal(b.readUInt16LE(end + 10), 2);
  assert.equal(b.readUInt32LE(end + 16), p, "the central directory starts after the last file");
});

test("an entry's name is the panel's own, never a source's path", () => {
  assert.equal(entryName({ n: 3, label: "../../etc/passwd.png", content_type: "image/png" }), "03-etc-passwd.png");
  assert.equal(entryName({ n: 12, label: null, content_type: "image/heic" }), "12-photo.bin");
});
