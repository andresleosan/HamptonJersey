// SPR-01: synthetic D1 and real browser, inside the networkless isolated runner only.
const { chromium } = require(process.env.PW || 'playwright-core');
const assert = require('node:assert/strict');
const { readFileSync, mkdirSync } = require('node:fs');
const { parseEnv } = require('node:util');
const { execFileSync } = require('node:child_process');
const { dirname, join } = require('node:path');
const BASE = process.env.BASE;
const vars = parseEnv(readFileSync(process.env.E2E_VARS, 'utf8'));
const wrangler = join(dirname(require.resolve('wrangler')), '..', 'bin', 'wrangler.js');
const sql = command => execFileSync(process.execPath, [wrangler, 'd1', 'execute', 'hampton', '--local',
  '--persist-to', process.env.E2E_PERSIST, '--command', command], { stdio: 'ignore' });

(async () => {
  assert.ok(BASE && process.env.E2E_PERSIST, 'local fixture required');
  const { signSession, COOKIE } = await import('../server/auth.js');
  const browser = await chromium.launch({ executablePath: process.env.CHROME });
  try {
    for (const [width, timezoneId] of [[1280, 'Europe/Jersey'], [390, 'America/Los_Angeles'], [390, 'Pacific/Kiritimati']]) {
      sql(`UPDATE listings SET bedrooms=0,bathrooms=0,available_on='2026-11-12',availability='for_sale',archived_at=NULL WHERE id='HE-R001';
        UPDATE listings SET bathrooms=1,available_on='2027-02-28',availability='to_let',archived_at=NULL WHERE id='HE-R002';
        UPDATE listings SET bathrooms=2,available_on='2027-01-01',availability='sold',archived_at=NULL WHERE id='HE-R003';
        UPDATE listings SET bathrooms=NULL,available_on=NULL,archived_at=NULL WHERE id='HE-C001';
        UPDATE listings SET bathrooms=1,available_on='2027-01-01',availability='withdrawn',archived_at=NULL WHERE id='HE-R004';
        UPDATE listings SET bathrooms=1,available_on='2027-01-01',availability='for_sale',published=0,archived_at='2026-11-01' WHERE id='HE-R005';
        UPDATE listings SET bathrooms=1,available_on='2027-01-01',availability='let_agreed',archived_at=NULL WHERE id='HE-R006';
        UPDATE listings SET bathrooms=1,available_on='2027-01-01',availability='let',archived_at=NULL WHERE id='HE-R007';`);
      const context = await browser.newContext({ viewport: { width, height: 900 }, timezoneId, reducedMotion: 'reduce' });
      await context.addCookies([{ name: COOKIE, value: await signSession('admin@example.test', vars.SESSION_SECRET),
        domain: new URL(BASE).hostname, path: '/', secure: true, httpOnly: true, sameSite: 'Strict' }]);
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      const openAll = async () => {
        await page.goto(BASE + 'admin/#/listings');
        await page.getByRole('heading', { name: 'Listings', exact: true }).waitFor();
        await page.locator('.seg button').filter({ hasText: /^All\d+$/ }).click();
      };
      const row = id => page.getByRole('row').filter({ has: page.locator(`a[href="#/p/${id}"]`) });
      await openAll();
      const zero = row('HE-R001'), one = row('HE-R002'), two = row('HE-R003'), unknown = row('HE-C001');
      assert.match(await zero.innerText(), /Studio/);
      assert.match(await zero.innerText(), /\b0 baths\b/);
      assert.match(await zero.innerText(), /Available from 12 Nov 2026/);
      assert.match(await one.innerText(), /\b1 bath\b/);
      assert.match(await one.innerText(), /Available from 28 Feb 2027/);
      assert.match(await two.innerText(), /\b2 baths\b/);
      assert.doesNotMatch(await unknown.innerText(), /\b\d+ baths?\b|Available from/);
      for (const id of ['HE-R003', 'HE-R004', 'HE-R005', 'HE-R006', 'HE-R007'])
        assert.doesNotMatch(await row(id).innerText(), /Available from/, `${id} must not advertise an active date`);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'no horizontal overflow');
      const link = zero.getByRole("link", { name: "Le Bernage", exact: true });
      await link.focus();
      assert.equal(await link.evaluate(el => document.activeElement === el), true);
      await page.keyboard.press('Enter');
      const date = page.getByLabel('Available from', { exact: true });
      await date.waitFor();
      assert.equal(await date.inputValue(), '2026-11-12');
      assert.match(await date.getAttribute('aria-describedby') || '', /hint-available-on/);
      assert.match(await page.locator('#hint-available-on').innerText(), /does not confirm availability/i);
      await date.fill('2028-02-29');
      await page.getByRole('button', { name: 'Discard', exact: true }).click();
      assert.equal(await date.inputValue(), '2026-11-12');
      await date.fill('2028-02-29');
      // Fixture responses exercise the real editor's error and conflict recovery, not a live API.
      const routePath = '**/api/admin/listings/HE-R001';
      const validationFailure = route => route.request().method() === 'PUT'
        ? route.fulfill({ status: 400, json: { error: 'Please check the highlighted fields', fields: { available_on: 'Synthetic date validation error' } } })
        : route.continue();
      await page.route(routePath, validationFailure);
      await page.getByRole('button', { name: 'Save', exact: true }).click();
      await page.getByRole('alert').filter({ hasText: 'Please check the highlighted fields' }).waitFor();
      assert.equal(await date.inputValue(), '2028-02-29');
      assert.equal(await date.getAttribute('aria-invalid'), 'true');
      assert.match(await date.getAttribute('aria-describedby'), /hint-available-on/);
      assert.match(await date.getAttribute('aria-describedby'), /e-available_on/);
      await page.unroute(routePath, validationFailure);
      const conflict = route => route.request().method() === 'PUT'
        ? route.fulfill({ status: 409, json: { error: 'Synthetic version conflict' } }) : route.continue();
      await page.route(routePath, conflict);
      await page.getByRole('button', { name: 'Save', exact: true }).click();
      await page.getByRole('alert').filter({ hasText: 'Synthetic version conflict' }).waitFor();
      assert.equal(await date.inputValue(), '2028-02-29');
      await page.unroute(routePath, conflict);
      await page.getByRole('button', { name: 'Save', exact: true }).focus();
      await page.keyboard.press('Enter');
      await page.getByRole('status').filter({ hasText: 'Changes saved.' }).waitFor();
      await openAll();
      assert.match(await row('HE-R001').innerText(), /Available from 29 Feb 2028/);
      // Native WebKit zoom changes the CSS viewport and triggers the real responsive breakpoint.
      // Chromium has no headed window in this runner, so use its equivalent viewport for reflow.
      const beforeZoom = await page.evaluate(() => innerWidth);
      if (process.env.HAMPTON_E2E_BROWSER === 'webkit') {
        execFileSync('python3', ['tests/e2e-x11-zoom.py', 'in']);
        await page.waitForFunction(w => innerWidth <= w / 2, beforeZoom);
      } else {
        await page.setViewportSize({ width: Math.floor(width / 2), height: 900 });
      }
      const zoomLink = row('HE-R001').getByRole('link', { name: 'Le Bernage', exact: true });
      await zoomLink.scrollIntoViewIfNeeded();
      await zoomLink.focus();
      assert.equal(await zoomLink.evaluate(el => document.activeElement === el), true, 'listing link remains keyboard-focusable at zoom');
      const zoom = await page.evaluate(() => ({ viewport: innerWidth, scroll: document.documentElement.scrollWidth,
        overflow: [...document.querySelectorAll('body *')].filter(el => {
          const box = el.getBoundingClientRect();
          return box.width && box.right > innerWidth + 1 && getComputedStyle(el).visibility !== 'hidden';
        }).slice(0, 12).map(el => ({ tag: el.tagName, className: el.className, right: Math.round(el.getBoundingClientRect().right) })) }));
      if (process.env.E2E_SHOTS) {
        mkdirSync(process.env.E2E_SHOTS, { recursive: true });
        await page.screenshot({ path: join(process.env.E2E_SHOTS, `spr01-${width}-${timezoneId.replaceAll('/', '-')}.png`), fullPage: true });
      }
      if (zoom.scroll > zoom.viewport + 1) {
        zoom.withoutNewData = await page.evaluate(() => {
          document.querySelectorAll('.list.listings .meta span').forEach(el => { if (/^\d+ baths?$/.test(el.textContent)) el.remove(); });
          document.querySelectorAll('.list.listings td .muted').forEach(el => { if (el.textContent.startsWith('Available from ')) el.remove(); });
          return document.documentElement.scrollWidth;
        });
      }
      assert.ok(zoom.scroll <= zoom.viewport + 1, 'no horizontal overflow at 200%: ' + JSON.stringify(zoom));
      if (process.env.HAMPTON_E2E_BROWSER === 'webkit') execFileSync('python3', ['tests/e2e-x11-zoom.py', 'reset']);
      assert.deepEqual(errors, []);
      await context.close();
      console.log(`SPR-01: ${width}px ${timezoneId} passed`);
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
