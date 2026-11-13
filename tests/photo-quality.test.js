import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as photo from '../admin/src/image.js';
import { analysePhotoPixels } from '../admin/src/photo-quality.js';

// Hand-built luminance patterns: these are synthetic images, never real property photos.
const pattern = pixel => {
  const width = 128, height = 96, data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const p = (y * width + x) * 4, value = pixel(x, y);
    data[p] = data[p + 1] = data[p + 2] = value; data[p + 3] = 255;
  }
  return { width, height, data };
};
const sharp = pattern((x, y) => (Math.floor(x / 4) + Math.floor(y / 4)) % 2 ? 200 : 60);
const dark = pattern(() => 12), bright = pattern(() => 248);
const soft = pattern(x => 50 + x);
const analyse = (pixels, width = 1800, height = 1200, kind = 'photo') =>
  analysePhotoPixels(pixels, { width, height, kind });

test('warns when the longest image side is below 1200 pixels', () => {
  const result = analyse(sharp, 1199, 900);
  assert.ok(result?.warnings.includes('resolution'));
  assert.equal(result.width, 1199);
  assert.equal(result.height, 900);
  assert.equal(analyse(sharp, 1200, 900).warnings.includes('resolution'), false);
});

test('reports extreme dark and bright samples but not a well-exposed sharp sample', () => {
  assert.ok(analyse(dark).warnings.includes('exposure_dark'));
  assert.ok(analyse(bright).warnings.includes('exposure_bright'));
  assert.deepEqual(analyse(sharp).warnings, []);
});

test('reports soft detail as a suggestion and leaves floor-plan tone and focus alone', () => {
  assert.ok(analyse(soft).warnings.includes('focus'));
  assert.deepEqual(analyse(soft, 1800, 1200, 'floorplan').warnings, []);
  assert.ok(analyse(sharp, 800, 600, 'floorplan').warnings.includes('resolution'));
});

async function withSyntheticBrowser(bitmap, run, failSample = false) {
  const old = { OffscreenCanvas: globalThis.OffscreenCanvas, createImageBitmap: globalThis.createImageBitmap, fetch: globalThis.fetch };
  globalThis.createImageBitmap = async () => ({ ...bitmap, close() {} });
  globalThis.OffscreenCanvas = class {
    constructor(width, height) { this.width = width; this.height = height; }
    getContext() {
      return { fillRect() {}, drawImage() {}, getImageData: () => {
        if (failSample) throw new Error('sample unavailable');
        const data = new Uint8ClampedArray(this.width * this.height * 4);
        for (let i = 0; i < data.length; i += 4) { data[i] = data[i + 1] = data[i + 2] = 12; data[i + 3] = 255; }
        return { width: this.width, height: this.height, data };
      } };
    }
    async convertToBlob() {
      const { readFileSync } = await import('node:fs');
      return new Blob([readFileSync(new URL('./fixtures/media-upload/baseline.jpg', import.meta.url))], { type: 'image/jpeg' });
    }
  };
  globalThis.fetch = async () => new Response(JSON.stringify({ media: { id: 'synthetic' } }), { status: 201 });
  try { await run(); } finally { Object.assign(globalThis, old); }
}

test('rounded dimensions of a large image never exceed 16 megapixels', async () => {
  await withSyntheticBrowser({ width: 4001, height: 4081 }, async () => {
    const result = await photo.resizeImage(new Blob(['fixture']), null);
    assert.ok(result.width * result.height <= 16_000_000);
  });
});

test('a quality warning is returned after upload without blocking it', async () => {
  await withSyntheticBrowser({ width: 800, height: 600 }, async () => {
    let report;
    const media = await photo.uploadPhoto('HE-R001', new Blob(['fixture']), { onQuality: value => { report = value; } });
    assert.equal(media.id, 'synthetic');
    assert.ok(report?.warnings.includes('resolution'));
    assert.ok(report.warnings.includes('exposure_dark'));
  });
});

test('an unavailable quality sample does not prevent upload and is reported honestly', async () => {
  await withSyntheticBrowser({ width: 1800, height: 1200 }, async () => {
    let report;
    const media = await photo.uploadPhoto('HE-R001', new Blob(['fixture']), { onQuality: value => { report = value; } });
    assert.equal(media.id, 'synthetic');
    assert.equal(report?.unavailable, true);
  }, true);
});

test('creating a draft keeps successful photo suggestions available to its caller', async () => {
  await withSyntheticBrowser({ width: 800, height: 600 }, async () => {
    const { createDraft } = await import('../admin/src/createDraft.js');
    globalThis.fetch = async (path, options) => {
      if (path === '/api/admin/listings') return Response.json({ id: 'HE-R123' }, { status: 201 });
      if (path.endsWith('/media') && options.method === 'POST') return Response.json({ media: { id: 'U123', kind: 'photo' } }, { status: 201 });
      if (path.endsWith('/media') && options.method === 'PUT') return Response.json({});
      return Response.json({ listing: { updated_at: 'synthetic-version' } });
    };
    const result = await createDraft({}, [{ name: 'small.jpg', kind: 'photo', file: new Blob(['fixture']) }]);
    assert.equal(result.uploaded, 1);
    assert.equal(result.failed.length, 0);
    assert.ok(result.qualityWarnings?.[0].text.includes('under 1,200 px'));
  });
});

test('the 16 megapixel limit also holds for an extremely narrow image', async () => {
  await withSyntheticBrowser({ width: 100_000_000, height: 1 }, async () => {
    const result = await photo.resizeImage(new Blob(['fixture']), null);
    assert.ok(result.width * result.height <= 16_000_000);
  });
});

const deferred = () => {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
};

test('draft stops after a pending file load and keeps previously confirmed photos', async () => {
  await withSyntheticBrowser({ width: 800, height: 600 }, async () => {
    const { createDraft } = await import('../admin/src/createDraft.js');
    const started = deferred(), release = deferred(), calls = [];
    let active = true;
    globalThis.fetch = async (path, options) => {
      calls.push([path, options.method]);
      if (path === '/api/admin/listings') return Response.json({ id: 'HE-R123' }, { status: 201 });
      return Response.json({ media: { id: 'U123', kind: 'photo' } }, { status: 201 });
    };
    const photos = [
      { name: 'first.jpg', kind: 'photo', file: new Blob(['first']) },
      { name: 'second.jpg', kind: 'photo', load: async () => { started.resolve(); await release.promise; return new Blob(['second']); } },
    ];
    const operation = createDraft({}, photos, { alive: () => active });
    await started.promise; active = false; release.resolve();
    const result = await operation;
    assert.equal(result.uploaded, 1, 'the previously confirmed photo remains recorded');
    assert.deepEqual(result.failed, []);
    assert.equal(result.coverFailed, false);
    assert.deepEqual(calls, [['/api/admin/listings', 'POST'], ['/api/admin/listings/HE-R123/media', 'POST']]);
  });
});

test('upload stops before POST if the caller leaves during image encoding', async () => {
  await withSyntheticBrowser({ width: 800, height: 600 }, async () => {
    const started = deferred(), release = deferred();
    const Canvas = globalThis.OffscreenCanvas;
    globalThis.OffscreenCanvas = class extends Canvas {
      async convertToBlob() { if (this.width === 800) { started.resolve(); await release.promise; } return super.convertToBlob(); }
    };
    let active = true, posts = 0;
    globalThis.fetch = async () => { posts++; return Response.json({ media: { id: 'U123' } }, { status: 201 }); };
    const operation = photo.uploadPhoto('HE-R001', new Blob(['fixture']), { isCurrent: () => active });
    await started.promise; active = false; release.resolve();
    await assert.rejects(operation, { name: 'AbortError' });
    assert.equal(posts, 0);
  });
});

test('draft does not report a failure or start a photo POST after leaving during encoding', async () => {
  await withSyntheticBrowser({ width: 800, height: 600 }, async () => {
    const { createDraft } = await import('../admin/src/createDraft.js');
    const started = deferred(), release = deferred(), calls = [];
    const Canvas = globalThis.OffscreenCanvas;
    globalThis.OffscreenCanvas = class extends Canvas {
      async convertToBlob() { if (this.width === 800) { started.resolve(); await release.promise; } return super.convertToBlob(); }
    };
    let active = true;
    globalThis.fetch = async (path, options) => {
      calls.push([path, options.method]);
      if (path === '/api/admin/listings') return Response.json({ id: 'HE-R123' }, { status: 201 });
      return Response.json({ media: { id: 'U123' } }, { status: 201 });
    };
    const operation = createDraft({}, [{ name: 'photo.jpg', kind: 'photo', file: new Blob(['fixture']) }], { alive: () => active });
    await started.promise; active = false; release.resolve();
    const result = await operation;
    assert.equal(result.uploaded, 0);
    assert.deepEqual(result.failed, []);
    assert.deepEqual(calls, [['/api/admin/listings', 'POST']]);
  });
});

test('draft does not change the cover after leaving during the listing GET', async () => {
  await withSyntheticBrowser({ width: 800, height: 600 }, async () => {
    const { createDraft } = await import('../admin/src/createDraft.js');
    const started = deferred(), release = deferred(), calls = [];
    let active = true;
    globalThis.fetch = async (path, options) => {
      calls.push([path, options.method]);
      if (path === '/api/admin/listings') return Response.json({ id: 'HE-R123' }, { status: 201 });
      if (path === '/api/admin/listings/HE-R123/media' && options.method === 'POST') return Response.json({ media: { id: 'U123' } }, { status: 201 });
      if (path === '/api/admin/listings/HE-R123' && options.method === 'GET') {
        started.resolve(); await release.promise; return Response.json({ listing: { updated_at: 'version' } });
      }
      return Response.json({});
    };
    const operation = createDraft({}, [{ name: 'photo.jpg', kind: 'photo', file: new Blob(['fixture']) }], { alive: () => active });
    await started.promise; active = false; release.resolve();
    const result = await operation;
    assert.equal(result.uploaded, 1, 'a confirmed photo remains in the draft');
    assert.equal(result.coverFailed, false);
    assert.deepEqual(calls, [
      ['/api/admin/listings', 'POST'], ['/api/admin/listings/HE-R123/media', 'POST'], ['/api/admin/listings/HE-R123', 'GET'],
    ]);
  });
});

test('a photo POST already sent may finish, but no cover request starts after leaving', async () => {
  await withSyntheticBrowser({ width: 800, height: 600 }, async () => {
    const { createDraft } = await import('../admin/src/createDraft.js');
    const started = deferred(), release = deferred(), calls = [];
    let active = true;
    globalThis.fetch = async (path, options) => {
      calls.push([path, options.method]);
      if (path === '/api/admin/listings') return Response.json({ id: 'HE-R123' }, { status: 201 });
      started.resolve(); await release.promise; return Response.json({ media: { id: 'U123' } }, { status: 201 });
    };
    const operation = createDraft({}, [{ name: 'photo.jpg', kind: 'photo', file: new Blob(['fixture']) }], { alive: () => active });
    await started.promise; active = false; release.resolve();
    const result = await operation;
    assert.equal(result.uploaded, 1);
    assert.deepEqual(result.failed, []);
    assert.deepEqual(calls, [['/api/admin/listings', 'POST'], ['/api/admin/listings/HE-R123/media', 'POST']]);
  });
});

test('a current draft still assigns its confirmed photo as cover', async () => {
  await withSyntheticBrowser({ width: 800, height: 600 }, async () => {
    const { createDraft } = await import('../admin/src/createDraft.js');
    let cover;
    globalThis.fetch = async (path, options) => {
      if (path === '/api/admin/listings') return Response.json({ id: 'HE-R123' }, { status: 201 });
      if (path.endsWith('/media') && options.method === 'POST') return Response.json({ media: { id: 'U123' } }, { status: 201 });
      if (path.endsWith('/media') && options.method === 'PUT') { cover = JSON.parse(options.body); return Response.json({}); }
      return Response.json({ listing: { updated_at: 'version' } });
    };
    const result = await createDraft({}, [{ name: 'photo.jpg', kind: 'photo', file: new Blob(['fixture']) }]);
    assert.equal(result.uploaded, 1);
    assert.equal(result.coverFailed, false);
    assert.equal(cover.cover_media_id, 'U123');
    assert.equal(cover.updated_at, 'version');
  });
});

test('a file load that fails after leaving does not report a failed upload', async () => {
  await withSyntheticBrowser({ width: 800, height: 600 }, async () => {
    const { createDraft } = await import('../admin/src/createDraft.js');
    const started = deferred(), release = deferred(), calls = [];
    let active = true;
    globalThis.fetch = async (path, options) => { calls.push([path, options.method]); return Response.json({ id: 'HE-R123' }, { status: 201 }); };
    const operation = createDraft({}, [{ name: 'photo.jpg', kind: 'photo', load: async () => {
      started.resolve(); await release.promise; throw new Error('fixture load failure');
    } }], { alive: () => active });
    await started.promise; active = false; release.resolve();
    const result = await operation;
    assert.deepEqual(result.failed, []);
    assert.deepEqual(calls, [['/api/admin/listings', 'POST']]);
  });
});
