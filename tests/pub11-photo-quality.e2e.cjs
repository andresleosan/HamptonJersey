// Local synthetic photos only. The real upload route and R2/D1 fixture are exercised inside the isolated container.
const { chromium } = require(process.env.PW || 'playwright-core');
const assert = require('node:assert/strict');
const { readFileSync, mkdirSync, writeFileSync } = require('node:fs');
const { parseEnv } = require('node:util');
const { join } = require('node:path');
const BASE = process.env.BASE, vars = parseEnv(readFileSync(process.env.E2E_VARS, 'utf8'));

// A minimal synthetic EXIF GPS pointer and GPS latitude reference, inserted in a valid canvas JPEG.
function withSyntheticGps(jpeg) {
  const tiff = Buffer.alloc(44);
  tiff.write('II', 0); tiff.writeUInt16LE(42, 2); tiff.writeUInt32LE(8, 4);
  tiff.writeUInt16LE(1, 8); tiff.writeUInt16LE(0x8825, 10); tiff.writeUInt16LE(4, 12);
  tiff.writeUInt32LE(1, 14); tiff.writeUInt32LE(26, 18);
  tiff.writeUInt16LE(1, 26); tiff.writeUInt16LE(1, 28); tiff.writeUInt16LE(2, 30);
  tiff.writeUInt32LE(2, 32); tiff[36] = 78;
  const body = Buffer.concat([Buffer.from([0x45, 0x78, 0x69, 0x66, 0, 0]), tiff]);
  const header = Buffer.from([0xff, 0xe1, 0, 0]); header.writeUInt16BE(body.length + 2, 2);
  return Buffer.concat([jpeg.subarray(0, 2), header, body, jpeg.subarray(2)]);
}
(async () => {
  const { signSession, COOKIE } = await import('../server/auth.js');
  const browser = await chromium.launch();
  try { for (const width of [1280, 390]) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce' });
    await context.addCookies([{ name: COOKIE, value: await signSession('admin@example.test', vars.SESSION_SECRET),
      domain: new URL(BASE).hostname, path: '/', secure: true, httpOnly: true, sameSite: 'Strict' }]);
    const page = await context.newPage(), errors = [], uploaded = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => {
      const offlineFontPreconnect = process.env.E2E_OFFLINE_FONTS === '1' &&
        /^Failed to preconnect to https:\/\/fonts\.(?:gstatic|googleapis)\.com\//.test(message.text());
      if (message.type() === 'error' && !/Failed to load resource/i.test(message.text()) && !offlineFontPreconnect)
        errors.push(message.text());
    });
    page.on('response', async response => {
      if (response.request().method() === 'POST' && /\/api\/admin\/listings\/HE-R003\/media$/.test(response.url()) && response.status() === 201)
        uploaded.push((await response.json()).media);
    });
    await page.goto(BASE + 'admin/#/p/HE-R003');
    await page.getByRole('navigation', { name: 'Listing sections' }).waitFor();
    const photos = page.locator('#s-photos'), nav = page.getByRole('button', { name: 'Photos', exact: true });
    await nav.focus(); await page.keyboard.press('Enter');
    const input = photos.locator('input[type=file]');
    await input.focus();
    assert.equal(await input.evaluate(el => el === document.activeElement), true, 'upload input has keyboard focus');
    assert.notEqual(await photos.locator('.upload').evaluate(el => getComputedStyle(el).outlineStyle), 'none');
    const bytes = await page.evaluate(async () => {
      const canvas = new OffscreenCanvas(1800, 1200), ctx = canvas.getContext('2d');
      ctx.fillStyle = 'rgb(12,12,12)'; ctx.fillRect(0, 0, 1800, 1200);
      return [...new Uint8Array(await (await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.92 })).arrayBuffer())];
    });
    const source = withSyntheticGps(Buffer.from(bytes));
    const firstUpload = page.waitForResponse(response => response.request().method() === 'POST' &&
      response.url().endsWith('/api/admin/listings/HE-R003/media'));
    await input.setInputFiles({ name: 'dark.jpg', mimeType: 'image/jpeg', buffer: source });
    const uploadResponse = await firstUpload;
    if (uploadResponse.status() !== 201) {
      const upload = uploadResponse.request(), headers = { 'content-type': upload.headers()['content-type'] };
      const data = await new Response(upload.postDataBuffer(), { headers }).formData();
      const output = process.env.E2E_SHOTS || '/tmp/hampton-shots'; mkdirSync(output, { recursive: true });
      for (const part of ['file', 'thumb']) {
        const bytes = Buffer.from(await data.get(part).arrayBuffer());
        writeFileSync(join(output, `pub11-canvas-${part}.jpg`), bytes);
        const segments = [];
        for (let p = 2; p + 4 <= bytes.length && bytes[p] === 255;) {
          const code = bytes[p + 1], length = bytes.readUInt16BE(p + 2);
          if (code === 218 || code === 217) break;
          segments.push([code, length]); if (length < 2) break; p += length + 2;
        }
        console.error('Synthetic canvas JPEG segments', part, JSON.stringify(segments));
      }
    }
    assert.equal(uploadResponse.status(), 201, `Photo upload failed: ${await uploadResponse.text()}`);
    await photos.getByRole('status').filter({ hasText: '1 photo(s) uploaded.' }).waitFor();
    await photos.getByText('Photo quality suggestions', { exact: true }).waitFor({ timeout: 4000 });
    await photos.getByText(/dark\.jpg:.*may be too dark/).waitFor();
    assert.equal(uploaded.length, 1, 'warning did not block upload');
    const media = uploaded[0];
    const stored = await page.evaluate(async id => {
      const read = async suffix => {
        const response = await fetch('/media/' + id + suffix), blob = await response.blob();
        const bitmap = await createImageBitmap(blob), bytes = [...new Uint8Array(await blob.arrayBuffer())];
        const result = { width: bitmap.width, height: bitmap.height, bytes }; bitmap.close(); return result;
      };
      return { full: await read(''), thumb: await read('?thumb') };
    }, media.id);
    assert.deepEqual([stored.full.width, stored.full.height], [1800, 1200]);
    assert.deepEqual([stored.thumb.width, stored.thumb.height], [640, 427]);
    assert.equal(Buffer.from(stored.full.bytes).includes(Buffer.from([0x45, 0x78, 0x69, 0x66, 0, 0])), false, 'GPS-bearing EXIF omitted from re-encoded full image');
    assert.equal(Buffer.from(stored.thumb.bytes).includes(Buffer.from([0x45, 0x78, 0x69, 0x66, 0, 0])), false, 'GPS-bearing EXIF omitted from re-encoded thumbnail');
    // Bypassing the canvas must not bypass the server's metadata/container checks.
    const direct = await page.evaluate(async ({ original, thumbnail }) => {
      const path = '/api/admin/listings/HE-R001';
      const count = async () => (await (await fetch(path)).json()).media.length;
      const before = await count(), statuses = [];
      for (const [full, thumb, type] of [
        [original, thumbnail, 'image/jpeg'],
        [thumbnail, [255, 216, 255, 224], 'image/jpeg'],
        [thumbnail, thumbnail, 'image/png'],
      ]) {
        const data = new FormData();
        data.append('file', new File([new Uint8Array(full)], 'direct.jpg', { type }));
        data.append('thumb', new File([new Uint8Array(thumb)], 'thumb.jpg', { type: 'image/jpeg' }));
        statuses.push((await fetch(path + '/media', { method: 'POST', body: data })).status);
      }
      return { before, after: await count(), statuses };
    }, { original: [...source], thumbnail: stored.thumb.bytes });
    assert.deepEqual(direct.statuses, [400, 400, 400]);
    assert.equal(direct.after, direct.before, 'invalid direct uploads did not create media rows');
    for (const [filename, type] of [['baseline.jpg', 'image/jpeg'], ['progressive.jpg', 'image/jpeg'],
      ['rgb.png', 'image/png'], ['lossy.webp', 'image/webp'], ['lossless.webp', 'image/webp'], ['alpha.webp', 'image/webp']]) {
      const decoded = await page.evaluate(async ({ bytes, type, thumbnail }) => {
        const data = new FormData();
        data.append('file', new File([new Uint8Array(bytes)], 'direct', { type }));
        data.append('thumb', new File([new Uint8Array(thumbnail)], 'thumb.jpg', { type: 'image/jpeg' }));
        data.append('width', '9999'); data.append('height', '9999');
        const response = await fetch('/api/admin/listings/HE-R001/media', { method: 'POST', body: data });
        const result = await response.json();
        if (response.status !== 201) return { status: response.status };
        const bitmap = await createImageBitmap(await (await fetch('/media/' + result.media.id)).blob());
        const out = { status: response.status, width: bitmap.width, height: bitmap.height,
          stored: [result.media.width, result.media.height] };
        bitmap.close(); return out;
      }, { bytes: [...readFileSync(join(__dirname, 'fixtures/media-upload', filename))], type, thumbnail: stored.thumb.bytes });
      assert.deepEqual(decoded, { status: 201, width: 32, height: 24, stored: [32, 24] }, filename);
    }
    const smallBytes = await page.evaluate(async () => {
      const canvas = new OffscreenCanvas(600, 400), ctx = canvas.getContext('2d');
      for (let x = 0; x < 600; x += 8) { ctx.fillStyle = x % 16 ? '#ccc' : '#444'; ctx.fillRect(x, 0, 8, 400); }
      return [...new Uint8Array(await (await canvas.convertToBlob({ type: 'image/jpeg' })).arrayBuffer())];
    });
    const smallName = 'small-' + 'a'.repeat(100) + '.jpg';
    await input.setInputFiles({ name: smallName, mimeType: 'image/jpeg', buffer: Buffer.from(smallBytes) });
    await photos.getByText(/under 1,200 px/).waitFor();
    assert.equal(uploaded.length, 2, 'the small image also uploaded');
    const smallDimensions = await page.evaluate(async id => {
      const bitmap = await createImageBitmap(await (await fetch('/media/' + id)).blob());
      const result = [bitmap.width, bitmap.height]; bitmap.close(); return result;
    }, uploaded[1].id);
    assert.deepEqual(smallDimensions, [600, 400], 'small photos are not upscaled');
    await input.setInputFiles({ name: 'invalid.jpg', mimeType: 'image/jpeg', buffer: Buffer.from('not an image') });
    await photos.getByRole('alert').filter({ hasText: "couldn't read the image" }).waitFor();
    assert.equal(uploaded.length, 2, 'malformed photo was not uploaded');
    await page.evaluate(() => { document.documentElement.style.zoom = '2'; });
    await input.scrollIntoViewIfNeeded();
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'reflows at CSS zoom 200%');
    if (process.env.E2E_SHOTS) { mkdirSync(process.env.E2E_SHOTS, { recursive: true }); await photos.screenshot({ path: join(process.env.E2E_SHOTS, `pub11-${width}.png`) }); }
    await page.evaluate(() => { document.documentElement.style.zoom = ''; });
    await page.goto(BASE + 'admin/#/listings');
    await page.getByRole('button', { name: 'Add new property' }).first().click();
    const draftForm = page.locator('.add-property');
    await draftForm.locator('input[type=file][multiple]:not([webkitdirectory])').setInputFiles({
      name: 'small.jpg', mimeType: 'image/jpeg', buffer: Buffer.from(smallBytes),
    });
    await draftForm.getByLabel('Title').fill(`Synthetic PUB-11 ${width}`);
    await draftForm.getByRole('button', { name: 'Create draft' }).click();
    const summary = page.locator('section.add-property');
    await summary.getByText('Photo quality suggestions', { exact: true }).waitFor({ timeout: 30000 });
    await summary.getByText(/under 1,200 px/).waitFor();
    const open = summary.getByRole('link', { name: 'Open the listing' });
    const id = (await open.getAttribute('href')).split('/').pop();
    const draft = await page.evaluate(async id => (await (await fetch('/api/admin/listings/' + id)).json()), id);
    assert.equal(draft.listing.published, 0, 'the warned upload remains in an unpublished draft');
    assert.equal(draft.media.length, 1);
    await open.focus(); await page.keyboard.press('Enter');
    await page.waitForURL(new RegExp('#/p/' + id + '$'));

    // Leaving a listing while one upload is pending must not start the next file for that old listing.
    await page.goto(BASE + 'admin/#/p/HE-R003');
    const oldPhotos = page.locator('#s-photos');
    await oldPhotos.locator('input[type=file]').waitFor({ state: 'attached' });
    let release, started, posts = 0;
    const gate = new Promise(resolve => { release = resolve; });
    const firstStarted = new Promise(resolve => { started = resolve; });
    const uploadUrl = '**/api/admin/listings/HE-R003/media';
    await page.route(uploadUrl, async route => {
      if (route.request().method() === 'POST') {
        posts++;
        if (posts === 1) { started(); await gate; }
      }
      await route.continue();
    });
    await oldPhotos.locator('input[type=file]').setInputFiles([
      { name: 'first.jpg', mimeType: 'image/jpeg', buffer: Buffer.from(smallBytes) },
      { name: 'second.jpg', mimeType: 'image/jpeg', buffer: Buffer.from(smallBytes) },
    ]);
    await firstStarted;
    await page.evaluate(() => { location.hash = '#/p/HE-R001'; });
    await page.waitForURL(/#\/p\/HE-R001$/);
    await page.waitForFunction(() => document.querySelector('#f-title')?.value === 'Le Bernage');
    const firstResponse = page.waitForResponse(response => response.request().method() === 'POST' && response.url().endsWith('/HE-R003/media'));
    release();
    const confirmed = (await (await firstResponse).json()).media;
    await page.waitForTimeout(500);
    assert.equal(posts, 1, 'no subsequent photo starts after leaving the listing');
    const previousDraft = await page.evaluate(async () => (await (await fetch('/api/admin/listings/HE-R003')).json()));
    assert.ok(previousDraft.media.some(item => item.id === confirmed.id), 'the already-sent photo remains in the original draft');
    assert.equal(await page.locator('#s-photos').getByText(/first\.jpg:/).count(), 0, 'no warning leaks to another listing');
    await page.unroute(uploadUrl);

    // Also leave while decoding is paused, before any network request has started.
    await page.goto(BASE + 'admin/#/p/HE-R003');
    await page.locator('#s-photos input[type=file]').waitFor({ state: 'attached' });
    await page.evaluate(() => {
      const original = globalThis.createImageBitmap.bind(globalThis);
      let releaseDecode;
      const gate = new Promise(resolve => { releaseDecode = resolve; });
      globalThis.__pub11DecodeWaiting = 0; globalThis.__pub11DecodeFinished = 0;
      globalThis.__pub11ReleaseDecode = releaseDecode;
      globalThis.createImageBitmap = async (...args) => {
        const held = args[0] instanceof File && args[0].name === 'held.jpg';
        if (held) { globalThis.__pub11DecodeWaiting++; await gate; }
        const result = await original(...args);
        if (held) globalThis.__pub11DecodeFinished++;
        return result;
      };
    });
    let prematurePosts = 0;
    await page.route(uploadUrl, async route => {
      if (route.request().method() === 'POST') prematurePosts++;
      await route.continue();
    });
    await page.locator('#s-photos input[type=file]').setInputFiles({
      name: 'held.jpg', mimeType: 'image/jpeg', buffer: Buffer.from(smallBytes),
    });
    await page.waitForFunction(() => globalThis.__pub11DecodeWaiting === 2);
    await page.evaluate(() => { location.hash = '#/p/HE-R001'; });
    await page.waitForURL(/#\/p\/HE-R001$/);
    await page.waitForFunction(() => document.querySelector('#f-title')?.value === 'Le Bernage');
    await page.evaluate(() => globalThis.__pub11ReleaseDecode());
    await page.waitForFunction(() => globalThis.__pub11DecodeFinished === 2);
    await page.waitForTimeout(500);
    assert.equal(prematurePosts, 0, 'leaving during image preparation prevents the first POST');
    await page.unroute(uploadUrl);

    // A new draft remains intact if its page is left while a selected photo is being prepared.
    await page.goto(BASE + 'admin/#/listings');
    await page.getByRole('button', { name: 'Add new property' }).first().click();
    const pendingDraft = page.locator('.add-property');
    await page.evaluate(() => {
      const original = globalThis.createImageBitmap.bind(globalThis);
      let releaseDecode;
      const gate = new Promise(resolve => { releaseDecode = resolve; });
      globalThis.__pub11DraftWaiting = 0; globalThis.__pub11DraftFinished = 0;
      globalThis.__pub11ReleaseDraft = releaseDecode;
      globalThis.createImageBitmap = async (...args) => {
        const held = args[0] instanceof File && args[0].name === 'draft-held.jpg';
        if (held) { globalThis.__pub11DraftWaiting++; await gate; }
        const result = await original(...args);
        if (held) globalThis.__pub11DraftFinished++;
        return result;
      };
    });
    let draftPhotoPosts = 0;
    const anyMediaUrl = /\/api\/admin\/listings\/HE-[A-Z]\d+\/media$/;
    await page.route(anyMediaUrl, async route => {
      if (route.request().method() === 'POST') draftPhotoPosts++;
      await route.continue();
    });
    await pendingDraft.locator('input[type=file][multiple]:not([webkitdirectory])').setInputFiles({
      name: 'draft-held.jpg', mimeType: 'image/jpeg', buffer: Buffer.from(smallBytes),
    });
    await pendingDraft.getByLabel('Title').fill(`Synthetic pending draft ${width}`);
    const createdResponse = page.waitForResponse(response => response.request().method() === 'POST' && response.url().endsWith('/api/admin/listings'));
    await pendingDraft.getByRole('button', { name: 'Create draft' }).click();
    const createdId = (await (await createdResponse).json()).id;
    await page.waitForFunction(() => globalThis.__pub11DraftWaiting === 2);
    await page.evaluate(() => { location.hash = '#/p/HE-R001'; });
    await page.waitForURL(/#\/p\/HE-R001$/);
    await page.waitForFunction(() => document.querySelector('#f-title')?.value === 'Le Bernage');
    await page.evaluate(() => globalThis.__pub11ReleaseDraft());
    await page.waitForFunction(() => globalThis.__pub11DraftFinished === 2);
    await page.waitForTimeout(500);
    assert.equal(draftPhotoPosts, 0, 'a draft does not start a photo POST after its page is left');
    const retained = await page.evaluate(async id => (await (await fetch('/api/admin/listings/' + id)).json()), createdId);
    assert.equal(retained.listing.published, 0, 'the draft remains available and unpublished');
    assert.equal(retained.media.length, 0);
    await page.unroute(anyMediaUrl);
    assert.deepEqual(errors, []); await context.close();
  } } finally { await browser.close(); }
  console.log('PUB-11 synthetic upload, quality warning, keyboard and CSS zoom 1280/390: PASS');
})().catch(error => { console.error(error); process.exitCode = 1; });
