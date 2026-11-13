// Local synthetic D1/R2 fixture only. Exercises the Worker stream and media visibility without production access.
const { chromium } = require(process.env.PW || 'playwright-core');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { parseEnv } = require('node:util');
const { execFileSync } = require('node:child_process');
const { join, dirname } = require('node:path');
const BASE = process.env.BASE, vars = parseEnv(readFileSync(process.env.E2E_VARS, 'utf8'));
const wrangler = join(dirname(require.resolve('wrangler')), '..', 'bin', 'wrangler.js');
const sql = statement => execFileSync(process.execPath, [wrangler, 'd1', 'execute', 'hampton', '--local',
  '--persist-to', process.env.E2E_PERSIST, '--json', '--command', statement], { stdio: ['ignore', 'pipe', 'pipe'] });

(async () => {
  const { signSession, COOKIE } = await import('../server/auth.js');
  const browser = await chromium.launch();
  try { for (const width of [1280, 390]) {
    const staff = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce' });
    await staff.addCookies([{ name: COOKIE, value: await signSession('admin@example.test', vars.SESSION_SECRET),
      domain: new URL(BASE).hostname, path: '/', secure: true, httpOnly: true, sameSite: 'Strict' }]);
    const page = await staff.newPage(), errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(BASE + 'admin/#/p/HE-R001');
    await page.getByRole('navigation', { name: 'Listing sections' }).waitFor();
    const uploaded = await page.evaluate(async () => {
      const canvas = new OffscreenCanvas(48, 32), ctx = canvas.getContext('2d');
      ctx.fillStyle = '#82909a'; ctx.fillRect(0, 0, 48, 32);
      const original = new Uint8Array(await (await canvas.convertToBlob({ type: 'image/jpeg' })).arrayBuffer());
      const comment = new TextEncoder().encode('Synthetic image note: %PDF- is ordinary text');
      const bytes = new Uint8Array(original.length + comment.length + 4), length = comment.length + 2;
      bytes.set(original.subarray(0, 2)); bytes.set([0xff, 0xfe, length >> 8, length & 255], 2);
      bytes.set(comment, 6); bytes.set(original.subarray(2), 6 + comment.length);
      const blob = new Blob([bytes], { type: 'image/jpeg' });
      const bitmap = await createImageBitmap(blob);
      if (bitmap.width !== 48 || bitmap.height !== 32) throw new Error('Synthetic JPEG failed to decode');
      bitmap.close();
      const form = new FormData(); form.append('file', blob, 'photo.jpg'); form.append('thumb', blob, 'thumb.jpg');
      const response = await fetch('/api/admin/listings/HE-R001/media', { method: 'POST', body: form });
      return { status: response.status, media: (await response.json()).media, bytes: [...new Uint8Array(await blob.arrayBuffer())] };
    });
    assert.equal(uploaded.status, 201);
    const id = uploaded.media.id;
    assert.match(id, /^U[a-f0-9]{16}$/);
    sql(`UPDATE media SET content_type=NULL WHERE id='${id}'`); // exercise a legacy null MIME in the local fixture
    const anonymous = await browser.newContext({ viewport: { width, height: 900 } });
    const response = await anonymous.request.get(BASE + `media/${id}`);
    assert.equal(response.status(), 200);
    assert.equal(response.headers()['cache-control'], 'public, max-age=86400');
    assert.deepEqual(await response.body(), Buffer.from(uploaded.bytes));
    const catalog = await (await anonymous.request.get(BASE + 'api/listings')).json();
    assert.ok(catalog.find(item => item.id === 'HE-R001').photos.some(photo => photo.src === `/media/${id}`));

    const changed = await page.evaluate(async id => {
      const current = await (await fetch('/api/admin/listings/HE-R001')).json();
      const response = await fetch('/api/admin/listings/HE-R001/media', { method: 'PUT',
        headers: { 'content-type': 'application/json' }, body: JSON.stringify({
          items: [{ id, position: 99, public: true, kind: 'document', label: 'Synthetic document' }],
          cover_media_id: current.listing.cover_media_id, updated_at: current.listing.updated_at,
        }) });
      return response.status;
    }, id);
    assert.equal(changed, 200);
    const blocked = await anonymous.request.get(BASE + `media/${id}?fresh=1`);
    assert.equal(blocked.status(), 404);
    assert.match(blocked.headers()['cache-control'], /no-store/);
    const after = await (await anonymous.request.get(BASE + 'api/listings?fresh=1')).json();
    assert.ok(!after.find(item => item.id === 'HE-R001').photos.some(photo => photo.src === `/media/${id}`));
    const privateResponse = await staff.request.get(BASE + `media/${id}`);
    assert.equal(privateResponse.status(), 200);
    assert.equal(privateResponse.headers()['cache-control'], 'private, no-store');
    assert.deepEqual(await privateResponse.body(), Buffer.from(uploaded.bytes));
    assert.deepEqual(errors, []);
    await anonymous.close(); await staff.close();
  } } finally { await browser.close(); }
  console.log('PUB-11 synthetic public media Worker 1280/390: PASS');
})().catch(error => { console.error(error); process.exitCode = 1; });
