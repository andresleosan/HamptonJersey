// PRE-06: the panel when Cloudflare Access asks for its sign-in again, and the switch closing Staff in a real Pages
// fixture. Isolated local fixture only, synthetic data and IDs, no network:
//   E2E_PRODUCTION_READONLY=0 E2E_SCRIPT=tests/pre06-access.e2e.cjs npm run test:e2e:isolated
// The fixture runs with PRE06_ACCESS_READY off (as published): Access itself lives at Cloudflare's edge, so its expired
// sign-in is simulated by answering the panel's API calls with the redirect Access sends. The origin's own validation
// is covered by tests/server/pre06-*.test.mjs. A second fixture, switched on, shows Staff closed and the site open.
const { chromium } = require(process.env.PW || 'playwright-core');
const assert = require('node:assert/strict');
const { readFileSync, writeFileSync, cpSync, mkdtempSync, rmSync } = require('node:fs');
const { join } = require('node:path');
const { tmpdir } = require('node:os');
const { parseEnv } = require('node:util');
const { startFixture } = require('./serve-e2e.cjs');

const BASE = process.env.BASE, ORIGIN = new URL(BASE).origin;
const vars = parseEnv(readFileSync(process.env.E2E_VARS, 'utf8'));
const ACCESS_LOGIN = 'https://pre06-e2e.cloudflareaccess.com/cdn-cgi/access/login/hampton';
const IMAGE = readFileSync('tests/fixtures/media-upload/baseline.jpg'), THUMB = readFileSync('tests/fixtures/media-upload/thumb.jpg');

(async () => {
  assert.ok(BASE && process.env.E2E_PERSIST, 'isolated local fixture required');
  assert.equal(process.env.E2E_PRODUCTION_READONLY, '0');
  assert.notEqual(vars.PRE06_ACCESS_READY, '1', 'the main fixture runs switched off, as published');
  const { signSession, COOKIE } = await import('../server/auth.js');
  const browser = await chromium.launch({ executablePath: process.env.CHROME });
  try {
    for (const [width, listing] of [[1280, 'HE-R001'], [390, 'HE-R002']]) {
      const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce' });
      await context.addCookies([{ name: COOKIE, value: await signSession('admin@example.test', vars.SESSION_SECRET),
        domain: new URL(BASE).hostname, path: '/', secure: true, httpOnly: true, sameSite: 'Strict' }]);
      const page = await context.newPage(), errors = [];
      page.setDefaultTimeout(10000);
      page.on('pageerror', error => errors.push(error.message));

      // Panel photos come from the Staff route, never cached.
      const up = await context.request.post(`${BASE}api/admin/listings/${listing}/media`, { headers: { origin: ORIGIN },
        multipart: { file: { name: 'front.jpg', mimeType: 'image/jpeg', buffer: IMAGE },
          thumb: { name: 'front-thumb.jpg', mimeType: 'image/jpeg', buffer: THUMB }, kind: 'photo' } });
      assert.equal(up.status(), 201, await up.text());
      const photoId = (await up.json()).media.id;
      const staffPhoto = page.waitForResponse(r => r.url().includes(`/api/admin/media/${photoId}/content`));
      await page.goto(`${BASE}admin/#/p/${listing}`);
      const title = page.locator('#f-title');
      await title.waitFor();
      const photo = await staffPhoto;
      assert.equal(photo.status(), 200);
      assert.equal(photo.headers()['cache-control'], 'no-store');
      const img = page.locator(`img[src="/api/admin/media/${photoId}/content?thumb"]`);
      await img.waitFor();
      await page.waitForFunction(id => [...document.images].some(i => i.src.includes(id) && i.naturalWidth > 0), photoId);
      assert.equal(await page.locator('img[src^="/media/"]').count(), 0, 'no panel image uses the public route');

      // Access's sign-in expires: every API call gets its redirect instead of reaching Hampton.
      const writes = [];
      page.on('request', r => { if (r.url().includes('/api/') && !['GET', 'HEAD'].includes(r.method())) writes.push(r.method()); });
      const expired = r => r.fulfill({ status: 302, headers: { location: ACCESS_LOGIN } });
      await page.route('**/api/**', expired);
      const draft = `Draft kept while Access asks again (${width})`;
      await title.fill(draft);
      await page.getByRole('button', { name: 'Save', exact: true }).click();
      const dialog = page.getByRole('dialog', { name: 'Sign in again to continue' });
      await dialog.waitFor();
      await page.getByText('may or may not have been saved').waitFor();
      assert.deepEqual(writes, ['PUT'], 'the write is attempted once and never resent');
      assert.equal(await title.inputValue(), draft, 'the draft stays in this tab');
      const link = dialog.getByRole('link', { name: 'Open sign-in in a new tab' });
      assert.equal(await link.getAttribute('href'), '/admin/');
      assert.equal(await link.getAttribute('target'), '_blank');
      assert.deepEqual((await link.getAttribute('rel')).split(' ').sort(), ['noopener', 'noreferrer']);
      assert.equal(await link.evaluate(el => el === document.activeElement), true, 'focus starts on the sign-in link');
      await page.keyboard.press('Tab');
      assert.equal(await dialog.getByRole('button', { name: "I've signed in" }).evaluate(el => el === document.activeElement), true);
      if (width === 390) for (const control of [link, dialog.getByRole('button', { name: "I've signed in" })])
        assert.ok((await control.boundingBox()).height >= 44, '44px targets on a phone');
      // 200% zoom: the dialog fits and its actions stay reachable.
      await page.evaluate(() => { document.documentElement.style.zoom = '2'; });
      assert.ok(await dialog.locator('section').evaluate(el => el.scrollWidth <= el.clientWidth + 1));
      assert.ok(await link.isVisible());
      await page.evaluate(() => { document.documentElement.style.zoom = '1'; });

      // The sign-in opens in another tab; this one stays where it was. A blocked popup leaves the same link to use.
      const before = page.url();
      const [popup] = await Promise.all([context.waitForEvent('page'), link.click()]);
      await popup.waitForLoadState('domcontentloaded');
      assert.equal(new URL(popup.url()).pathname, '/admin/');
      await popup.close();
      assert.equal(page.url(), before);
      assert.equal(await title.inputValue(), draft);

      // Still expired: the check says so and sends nothing else.
      await dialog.getByRole('button', { name: "I've signed in" }).click();
      await dialog.getByText("Hampton still can't see your security sign-in").waitFor();
      assert.deepEqual(writes, ['PUT']);

      // Signed in again: only GET /api/me, the dialog goes, the draft is intact and nothing is resent.
      await page.unroute('**/api/**', expired);
      await dialog.getByRole('button', { name: "I've signed in" }).click();
      await dialog.waitFor({ state: 'detached' });
      assert.equal(await title.inputValue(), draft);
      assert.deepEqual(writes, ['PUT']);
      await page.getByRole('button', { name: 'Save', exact: true }).click();
      await page.getByRole('status').filter({ hasText: 'Changes saved.' }).waitFor();
      assert.deepEqual(writes, ['PUT', 'PUT']);

      // The answer is lost after Hampton wrote: the outcome is unknown, nothing is resent, and saving the same thing
      // again is refused by the listing's version instead of writing twice.
      const lost = async r => { await r.fetch(); await r.fulfill({ status: 302, headers: { location: ACCESS_LOGIN } }); };
      await page.route(`**/api/admin/listings/${listing}`, lost);
      const second = `${draft} again`;
      await title.fill(second);
      await page.getByRole('button', { name: 'Save', exact: true }).click();
      await dialog.waitFor();
      await page.unroute(`**/api/admin/listings/${listing}`, lost);
      await dialog.getByRole('button', { name: "I've signed in" }).click();
      await dialog.waitFor({ state: 'detached' });
      assert.equal(await title.inputValue(), second);
      assert.deepEqual(writes, ['PUT', 'PUT', 'PUT']);
      const saved = await (await context.request.get(`${BASE}api/admin/listings/${listing}`)).json();
      assert.equal(saved.listing.title, second, 'the lost write did happen, once');
      await page.getByRole('button', { name: 'Save', exact: true }).click();
      await page.getByRole('alert').filter({ hasText: 'Someone else saved changes' }).waitFor();
      assert.deepEqual(writes, ['PUT', 'PUT', 'PUT', 'PUT']);
      assert.equal((await (await context.request.get(`${BASE}api/admin/listings/${listing}`)).json()).listing.updated_at,
        saved.listing.updated_at, 'the repeated save wrote nothing');

      assert.deepEqual(errors, []);
      await context.close();
      console.log(`PRE-06 ${width}px: Staff media, reauth in another tab, draft kept, no resend, keyboard and 200% zoom passed.`);
    }

    // Switched on in a real Pages fixture (its own copy of the database): Staff closed without Access, site open.
    const dir = mkdtempSync(join(tmpdir(), 'hampton-pre06-on-'));
    let server;
    try {
      cpSync(process.env.E2E_PERSIST, join(dir, 'state'), { recursive: true });
      const onVars = join(dir, 'on.vars');
      writeFileSync(onVars, readFileSync(process.env.E2E_VARS, 'utf8') + ['PRE06_ACCESS_READY=1',
        'ACCESS_TEAM_DOMAIN=https://pre06-e2e.cloudflareaccess.com', `ACCESS_STAFF_AUD=${'e'.repeat(64)}`].join('\n') + '\n',
      { mode: 0o600 });
      server = await startFixture({ persist: join(dir, 'state'), varsFile: onVars, port: 0 });
      const on = await browser.newContext({ ignoreHTTPSErrors: true });
      await on.addCookies([{ name: COOKIE, value: await signSession('admin@example.test', vars.SESSION_SECRET),
        domain: server.url.hostname, path: '/', secure: true, httpOnly: true, sameSite: 'Strict' }]);
      const get = async (path, headers) => on.request.get(new URL(path, server.url).href, { headers, maxRedirects: 0 });
      for (const path of ['/admin/', '/admin/index.html', '/api/me', '/api/admin/listings', '/api/session'])
        assert.equal((await get(path)).status(), 403, path);
      const forged = await get('/admin/', { 'cf-access-jwt-assertion': 'not-a-token' });
      assert.equal(forged.status(), 403);
      assert.doesNotMatch(await forged.text(), /<script/i, 'no panel code without Access');
      assert.equal((await get('/api/hermes/status')).status(), 503, "Hermes's Access application not configured: closed");
      for (const path of ['/', '/api/listings', '/robots.txt']) assert.equal((await get(path)).status(), 200, path);
      await on.close();
      console.log('PRE-06 switched on: panel, admin API, session and Hermes closed without Access; public site open.');
    } finally {
      if (server) await server.close();
      rmSync(dir, { recursive: true, force: true });
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
