// AUT-01: the Automations screen's Clock tasks card with synthetic data. Each pass shows On or Off, what it does and its
// last run; a run that did not finish is an error line; an answer without passes shows no card. Nothing is sent.
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { build } = require('esbuild');
const { chromium, webkit } = require(process.env.PW || 'playwright-core');
const BASE_DATA = { clock: { at: null, stopped: false }, retention: null,
  hermes: { at: null, stopped: false, month: { used: 0, discarded: 0, failed: 0 }, waiting: [], recent: [] }, webchat: { on: false } };
const AT = '2026-11-14T10:00:00.000Z';
const PASSES = [{ id: 'inbox', on: true, at: AT }, { id: 'weekly', on: true, at: null }, { id: 'calls', on: true, at: null },
  { id: 'withdrawals', on: true, at: AT }, { id: 'demand', on: true, at: AT, ok: false }, { id: 'enquiries', on: false, at: null }];
(async () => {
  assert.equal(process.env.HAMPTON_E2E_ISOLATED, '1');
  assert.equal(process.env.E2E_PRODUCTION_READONLY, '0');
  const bundle = await build({ entryPoints: ['tests/automations-market-harness.jsx'], bundle: true, write: false, platform: 'browser', format: 'iife', jsx: 'automatic' });
  const css = readFileSync('admin/src/styles.css', 'utf8');
  const browser = await (process.env.HAMPTON_E2E_BROWSER === 'webkit' ? webkit : chromium).launch({ executablePath: process.env.CHROME });
  const open = async (width, passes) => {
    const page = await browser.newPage({ viewport: { width, height: 900 }, reducedMotion: 'reduce' });
    const errors = [], writes = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/api/**', async route => {
      const request = route.request(), path = new URL(request.url()).pathname;
      if (request.method() !== 'GET') { writes.push(path); return route.fulfill({ status: 405, json: { error: 'Fixture is read-only' } }); }
      if (path === '/api/admin/automations') return route.fulfill({ json: { ...BASE_DATA, ...(passes && { passes }) } });
      return route.fulfill({ status: 404, json: { error: 'Not found' } });
    });
    await page.route('**/aut01-clock-tasks-synthetic', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><div id="root"></div></body></html>' }));
    await page.goto(new URL('aut01-clock-tasks-synthetic', process.env.BASE).href);
    await page.addStyleTag({ content: css });
    await page.addScriptTag({ content: bundle.outputFiles[0].text });
    await page.getByRole('heading', { name: 'Automations', exact: true }).waitFor();
    await page.getByRole('heading', { name: 'Sending to clients and agencies' }).waitFor();
    return { page, errors, writes };
  };
  try {
    for (const width of [1280, 390]) {
      const none = await open(width, null);
      assert.equal(await none.page.getByRole('heading', { name: 'Clock tasks' }).count(), 0);
      assert.deepEqual(none.errors, []);
      await none.page.close();

      const { page, errors, writes } = await open(width, PASSES);
      const card = page.locator('article').filter({ has: page.getByRole('heading', { name: 'Clock tasks' }) });
      await card.waitFor();
      const task = name => card.locator('div').filter({ has: page.getByRole('heading', { name, level: 3 }) });
      assert.match(await task('Inbox tasks').innerText(), /On[\s\S]*Last run /);
      assert.match(await task('Weekly Insights').innerText(), /No run yet\./);
      assert.match(await task('Call-back tasks').innerText(), /Runs with each clock tick\./);
      assert.match(await task('Let rentals leave the website').innerText(), /Last run /);
      assert.match(await task('Demand clean-up').locator('.err').innerText(), /did not finish; it tries again later\./);
      const enquiries = await task('Enquiry emails').innerText();
      assert.match(enquiries, /Off[\s\S]*Held while sending is paused\./);
      assert.doesNotMatch(enquiries, /Last run|No run yet|Runs with/);
      assert.equal(await card.getByRole('button').count(), 0, 'the screen shows the switches; it never flips one');
      const scroll = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      assert.ok(scroll <= 0, `no horizontal scroll at ${width} (${scroll}px)`);
      await page.screenshot({ path: `/tmp/hampton-shots/aut01-clock-tasks-${width}.png`, fullPage: true }).catch(() => {});
      assert.deepEqual(errors, []);
      assert.deepEqual(writes, []);
      await page.close();
    }
  } finally { await browser.close(); }
  console.log('AUT-01 Clock tasks card: hidden without passes; on/off, last run and unfinished run at 1280/390 PASS');
})().catch(error => { console.error(error); process.exitCode = 1; });
