// Run only through test:e2e:isolated with the synthetic local fixture.
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
  const { jerseyToday } = await import('../server/viewings.js');
  const wrangler = join(dirname(require.resolve('wrangler')), '..', 'bin', 'wrangler.js');
  const day = jerseyToday();
  const query = `DELETE FROM daily_stats; INSERT INTO daily_stats(day,listing_id,metric,n) VALUES('${day}','HE-R001','view',3),('${day}','HE-R001','photos',2)`;
  execFileSync(process.execPath, [wrangler, 'd1', 'execute', 'hampton', '--local', '--persist-to', process.env.E2E_PERSIST,
    '--json', '--command', query], { stdio: 'pipe' });
  const browser = await chromium.launch({ executablePath: process.env.CHROME });
  const shots = process.env.E2E_SHOTS || '/tmp/hampton-shots'; mkdirSync(shots, { recursive: true });
  try {
    for (const width of [1280, 390]) {
      const ctx = await browser.newContext({ viewport: { width, height: 900 }, timezoneId: 'Europe/Jersey' });
      await ctx.addCookies([{ name: COOKIE, value: await signSession('admin@example.test', vars.SESSION_SECRET),
        domain: new URL(BASE).hostname, path: '/', httpOnly: true, secure: true, sameSite: 'Strict' }]);
      const page = await ctx.newPage(), errors = [];
      let expected503 = false;
      const consoleErrors = [], requestFailures = [];
      page.on('pageerror', e => errors.push(e.message));
      page.on('requestfailed', request => {
        const failure = request.failure()?.errorText || '';
        const origin = (() => { try { const u = new URL(request.url()); return u.origin === new URL(BASE).origin ? 'local' :
          ['fonts.googleapis.com', 'fonts.gstatic.com'].includes(u.hostname) ? 'google-fonts' : 'other'; } catch { return 'other'; } })();
        requestFailures.push({ origin, resourceType: request.resourceType(), code: failure.match(/ERR_[A-Z_]+/)?.[0] || 'other' });
      });
      page.on('console', m => {
        if (m.type() !== 'error' || (expected503 && /503/.test(m.text()))) return;
        const message = m.text();
        consoleErrors.push({ resourceFailure: /Failed to load resource/i.test(message),
          code: message.match(/ERR_[A-Z_]+/)?.[0] || 'other', service503: /503/.test(message) });
      });
      // The isolated container has no network. Use an empty local stylesheet for Google Fonts only.
      await page.route('https://fonts.googleapis.com/**', route => route.fulfill({ status: 200, contentType: 'text/css', body: '' }));
      page.setDefaultTimeout(10000);
      let activityRequests = 0;
      page.on('request', req => { if (new URL(req.url()).pathname === '/api/admin/insights/activity') activityRequests++; });
      await page.goto(new URL('admin/#/insights', BASE).href);
      const section = page.locator('section[aria-labelledby="h-activity"]');
      const table = section.getByRole('table', { name: 'Website activity sources' });
      await table.waitFor();
      const listing = table.getByRole('row', { name: /Listing opens/ });
      const gallery = table.getByRole('row', { name: /Gallery opens/ });
      const filters = table.getByRole('row', { name: /Filter actions/ });
      assert.match(await listing.innerText(), /\b3\b/);
      assert.match(await gallery.innerText(), /\b2\b/);
      assert.match(await listing.innerText(), /Unknown/);
      assert.match(await filters.innerText(), /Not tracked/);
      assert.match(await section.innerText(), /not people or sessions/i);
      assert.equal(await table.locator('a').count(), 0);
      if (width === 390) {
        const region = section.getByRole('region', { name: 'Website activity sources' });
        await region.focus();
        assert.equal(await region.evaluate(el => el === document.activeElement), true);
        await page.keyboard.press('ArrowRight');
        await page.waitForFunction(el => el.scrollLeft > 0, await region.elementHandle());
      }
      assert.equal(activityRequests, 0, 'the UI reuses the existing Insights request');
      const headers = await page.evaluate(async () => {
        const response = await fetch('/api/admin/insights/activity?days=30');
        return { status: response.status, cache: response.headers.get('cache-control') };
      });
      assert.deepEqual(headers, { status: 200, cache: 'no-store' });
      const periods = page.getByRole('group', { name: 'Period' });
      const week = periods.getByRole('button', { name: '7 days', exact: true });
      await week.focus();
      await page.keyboard.press('Tab'); await page.keyboard.press('Shift+Tab');
      assert.equal(await week.evaluate(el => el === document.activeElement), true);
      const focus = await week.evaluate(el => { const s = getComputedStyle(el); return { style: s.outlineStyle, width: s.outlineWidth, offset: s.outlineOffset }; });
      assert.notEqual(focus.style, 'none', JSON.stringify(focus));
      assert.ok(parseFloat(focus.width) >= 2, JSON.stringify(focus)); assert.ok(parseFloat(focus.offset) >= 2, JSON.stringify(focus));
      await Promise.all([page.waitForResponse(r => r.url().includes('/api/admin/insights?days=7') && r.status() === 200),
        page.keyboard.press('Enter')]);
      assert.equal(await week.getAttribute('aria-pressed'), 'true');
      await table.waitFor();
      const quarter = periods.getByRole('button', { name: '90 days', exact: true });
      await Promise.all([page.waitForResponse(r => r.url().includes('/api/admin/insights?days=90') && r.status() === 200),
        quarter.click()]);
      assert.equal(await quarter.getAttribute('aria-pressed'), 'true');
      await table.waitFor();
      assert.equal(activityRequests, 1, 'only the explicit direct endpoint check was made');
      await page.screenshot({ path: join(shots, `ana01-${width}.png`), fullPage: true });
      await page.evaluate(() => { document.documentElement.style.zoom = '2'; });
      await page.screenshot({ path: join(shots, `ana01-${width}-zoom.png`), fullPage: true });
      const overflow = await page.evaluate(() => ({ viewport: innerWidth, width: document.documentElement.scrollWidth,
        offenders: [...document.querySelectorAll('main *')].filter(e => {
          const r = e.getBoundingClientRect(); return r.right > innerWidth + 1 && !e.closest('.table-scroll');
        }).slice(0, 12).map(e => ({ tag: e.tagName, className: e.className, width: Math.round(e.getBoundingClientRect().width) })) }));
      assert.ok(overflow.width <= overflow.viewport + 1, `no global horizontal overflow at 200%: ${JSON.stringify(overflow)}`);
      await page.evaluate(() => { document.documentElement.style.zoom = '1'; });
      let fail = true;
      const handler = route => fail ? route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"Unavailable"}' }) : route.continue();
      await page.route('**/api/admin/insights?*', handler);
      expected503 = true;
      await periods.getByRole('button', { name: '30 days', exact: true }).click();
      await section.getByRole('alert').waitFor();
      assert.equal(await table.count(), 0);
      fail = false;
      const retry = section.getByRole('button', { name: 'Retry activity' });
      await retry.focus();
      assert.equal(await retry.evaluate(el => el === document.activeElement), true);
      await page.keyboard.press('Enter');
      await table.waitFor();
      expected503 = false;
      assert.deepEqual(errors, []);
      assert.deepEqual({ consoleErrors, requestFailures }, { consoleErrors: [], requestFailures: [] }, 'unexpected browser errors');
      await ctx.close();
      console.log(`Activity ${width}px: counts, coverage, keyboard, period, error/retry and 200% zoom passed.`);
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
