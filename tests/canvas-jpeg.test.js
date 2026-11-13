import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resizeImage } from '../admin/src/image.js';
import { inspectUploadImage } from '../server/upload-image.js';

const encoded = readFileSync(new URL('./fixtures/media-upload/canvas-chromium.jpg', import.meta.url));

test('Photos prepares the real Chromium canvas JPEG for the metadata-rejecting upload route without changing pixels', async () => {
  const previous = { OffscreenCanvas: globalThis.OffscreenCanvas, createImageBitmap: globalThis.createImageBitmap };
  globalThis.createImageBitmap = async () => ({ width: 1800, height: 1200, close() {} });
  globalThis.OffscreenCanvas = class {
    constructor(width, height) { this.width = width; this.height = height; }
    getContext() { return { fillRect() {}, drawImage() {} }; }
    async convertToBlob() { return new Blob([encoded], { type: 'image/jpeg' }); }
  };
  try {
    const result = await resizeImage(new Blob(['synthetic-input']), null);
    const bytes = Buffer.from(await result.blob.arrayBuffer());
    assert.deepEqual(inspectUploadImage(bytes), { contentType: 'image/jpeg', extension: 'jpg', width: 1800, height: 1200 });
    assert.deepEqual([result.width, result.height], [1800, 1200]);
    // SOI (2 bytes), fixed JFIF (18), then APP2 (marker + 472 bytes).
    // All quantization tables, frame, Huffman tables and entropy bytes stay exact.
    assert.deepEqual(bytes, Buffer.concat([encoded.subarray(0, 20), encoded.subarray(494)]));
  } finally { Object.assign(globalThis, previous); }
});
