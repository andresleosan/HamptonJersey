// ANA-10: staff see and download a listing's window poster QR; a scan opens the listing page and counts one aggregate
// open; a listing no longer on the website opens "Property not found" and counts nothing; Insights totals the opens.
// Run only through test:e2e:isolated with the synthetic local fixture (ANA10_QR_OPENS_READY on in tests/run-e2e.cjs).
const { chromium } = require(process.env.PW || 'playwright-core');
const assert = require('node:assert/strict');
const { readFileSync, mkdirSync } = require('node:fs');
const { parseEnv } = require('node:util');
const { execFileSync } = require('node:child_process');
const { join, dirname } = require('node:path');

(async () => {
  assert.ok(process.env.BASE && process.env.E2E_PERSIST && process.env.E2E_VARS, 'isolated fixture required');
  const BASE = process.env.BASE;
  const vars = parseEnv(readFileSync(process.env.E2E_VARS, 'utf8'));
  const { signSession, COOKIE } = await import('../server/auth.js');
  const wrangler = join(dirname(require.resolve('wrangler')), '..', 'bin', 'wrangler.js');
  const d1 = command => JSON.parse(execFileSync(process.execPath, [wrangler, 'd1', 'execute', 'hampton', '--local',
    '--persist-to', process.env.E2E_PERSIST, '--json', '--command', command], { stdio: 'pipe' }))[0].results;
  const opens = id => d1(`SELECT COALESCE(SUM(n), 0) AS n FROM listing_qr_opens WHERE listing_id = '${id}'`)[0].n;
  const browser = await chromium.launch({ executablePath: process.env.CHROME });
  const shots = process.env.E2E_SHOTS || '/tmp/hampton-shots'; mkdirSync(shots, { recursive: true });
  try {
    for (const width of [1280, 390]) {
      const ctx = await browser.newContext({ viewport: { width, height: 900 }, timezoneId: 'Europe/Jersey', acceptDownloads: true });
      await ctx.addCookies([{ name: COOKIE, value: await signSession('admin@example.test', vars.SESSION_SECRET),
        domain: new URL(BASE).hostname, path: '/', httpOnly: true, secure: true, sameSite: 'Strict' }]);
      const page = await ctx.newPage(), errors = [];
      page.on('pageerror', e => errors.push(e.message));
      await page.route('https://fonts.googleapis.com/**', route => route.fulfill({ status: 200, contentType: 'text/css', body: '' }));
      page.setDefaultTimeout(15000);

      // Panel: the QR of a published listing, read back from the rendered image by an independent decoder.
      await page.goto(new URL('admin/#/p/HE-R001', BASE).href);
      const card = page.locator('section[aria-labelledby="h-poster-qr"]');
      await card.waitFor();
      const url = (await card.locator('code').innerText()).trim();
      assert.match(url, /^https?:\/\/[^/]+\/p\/HE-R001\?src=qr$/);
      assert.equal(await card.getByRole('link', { name: url }).count(), 0, 'the panel never opens (and counts) the QR address');
      await page.addScriptTag({ path: require.resolve('jsqr/dist/jsQR.js') });
      const decoded = await card.locator('img').evaluate(async img => {
        await img.decode(); const c = document.createElement('canvas'); c.width = c.height = 600;
        const g = c.getContext('2d'); g.drawImage(img, 0, 0, 600, 600);
        return window.jsQR(g.getImageData(0, 0, 600, 600).data, 600, 600)?.data;
      });
      assert.equal(decoded, url);
      const download = card.getByRole('link', { name: 'Download QR (SVG)' });
      await download.focus();
      assert.equal(await download.evaluate(el => el === document.activeElement), true);
      const [file] = await Promise.all([page.waitForEvent('download'), page.keyboard.press('Enter')]);
      assert.equal(file.suggestedFilename(), 'HE-R001-poster-qr.svg');
      assert.match(readFileSync(await file.path(), 'utf8'), /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"[^>]*width="30mm"/);
      await card.screenshot({ path: join(shots, `ana10-panel-${width}.png`) });

      // A draft has no QR to print.
      await page.goto(new URL('admin/#/p/HE-R003', BASE).href);
      await card.waitFor();
      assert.match(await card.innerText(), /not on the website, so it has no poster QR/);
      assert.equal(await card.locator('img').count(), 0);

      // Website: the scan opens the listing, counts once and drops the mark; a reload counts nothing more.
      const before = opens('HE-R001');
      const scanned = page.waitForResponse(r => r.url().endsWith('/api/stats') && r.request().postDataJSON()?.metric === 'qr');
      const answer = await page.goto(new URL('/p/HE-R001?src=qr', BASE).href);
      assert.equal(answer.headers()['cache-control'], 'no-store');
      assert.equal((await scanned).status(), 204);
      await page.locator('h1', { hasText: 'Le Bernage' }).waitFor();
      assert.equal(new URL(page.url()).search, '');
      assert.equal(opens('HE-R001'), before + 1);
      await page.screenshot({ path: join(shots, `ana10-site-${width}.png`) });
      await page.reload(); await page.locator('h1', { hasText: 'Le Bernage' }).waitFor(); await page.waitForTimeout(500);
      assert.equal(opens('HE-R001'), before + 1);

      // A printed QR of a listing no longer on the website: Property not found (404), nothing counted.
      const sent = [];
      page.on('request', r => { if (r.url().endsWith('/api/stats') && r.postDataJSON()?.metric === 'qr') sent.push(r.url()); });
      const gone = await page.goto(new URL('/p/HE-R003?src=qr', BASE).href);
      assert.equal(gone.status(), 404);
      await page.getByRole('heading', { name: 'Property not found' }).waitFor();
      await page.waitForTimeout(500);
      assert.deepEqual(sent, []);
      assert.equal(opens('HE-R003'), 0);

      // Insights: the period's total.
      await page.goto(new URL('admin/#/insights', BASE).href);
      const figure = page.locator('.figures .card', { hasText: 'Poster QR opens' });
      await figure.waitFor();
      assert.equal((await figure.locator('dd').innerText()).trim(), String(opens('HE-R001')));
      await page.screenshot({ path: join(shots, `ana10-insights-${width}.png`), fullPage: true });
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
      assert.ok(overflow <= 1, `no horizontal overflow at ${width}px`);
      assert.deepEqual(errors, []);
      await ctx.close();
      console.log(`ANA-10 ${width}px: panel QR decoded and downloaded, scan counted once, retired QR 404 uncounted, Insights total.`);
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
