// AUT-10: the Automations screen's Modes card with synthetic data. Flag off (no modes in the answer): no card.
// Flag on: a manager switches Listing text drafts to Auto after confirming; a stale revision shows the current mode.
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { build } = require('esbuild');
const { chromium, webkit } = require(process.env.PW || 'playwright-core');
const BASE_DATA = { clock: { at: null, stopped: false }, retention: null,
  hermes: { at: null, stopped: false, month: { used: 0, discarded: 0, failed: 0 }, waiting: [], recent: [] }, webchat: { on: false } };
const AT = '2026-11-14T10:00:00.000Z';
const op = (automation_id, operation, mode = 'Draft', revision = 1, updated_by = 'migration') =>
  ({ automation_id, operation, mode, revision, updated_at: AT, updated_by });
const MODES = { can_edit: true, operations: [op('hampton_intent_v1', 'propose_intent'), op('listing_text', 'prepare_draft'),
  op('market_ambiguity_v1', 'propose_interpretation')] };
(async () => {
  assert.equal(process.env.HAMPTON_E2E_ISOLATED, '1');
  assert.equal(process.env.E2E_PRODUCTION_READONLY, '0');
  const bundle = await build({ entryPoints: ['tests/automations-market-harness.jsx'], bundle: true, write: false, platform: 'browser', format: 'iife', jsx: 'automatic' });
  const css = readFileSync('admin/src/styles.css', 'utf8');
  const browser = await (process.env.HAMPTON_E2E_BROWSER === 'webkit' ? webkit : chromium).launch({ executablePath: process.env.CHROME });
  const open = async (width, modes, onPost) => {
    const page = await browser.newPage({ viewport: { width, height: 900 }, reducedMotion: 'reduce' });
    const errors = [], posts = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('dialog', dialog => dialog.accept());
    await page.route('**/api/**', async route => {
      const request = route.request(), path = new URL(request.url()).pathname;
      if (request.method() === 'POST' && path === '/api/admin/automations/modes') {
        const body = request.postDataJSON(); posts.push(body);
        return route.fulfill(onPost(body));
      }
      if (request.method() !== 'GET') return route.fulfill({ status: 405, json: { error: 'Fixture is read-only' } });
      if (path === '/api/admin/automations') return route.fulfill({ json: { ...BASE_DATA, ...(modes && { modes }) } });
      return route.fulfill({ status: 404, json: { error: 'Not found' } });
    });
    await page.route('**/aut-10-modes-synthetic', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><div id="root"></div></body></html>' }));
    await page.goto(new URL('aut-10-modes-synthetic', process.env.BASE).href);
    await page.addStyleTag({ content: css });
    await page.addScriptTag({ content: bundle.outputFiles[0].text });
    await page.getByRole('heading', { name: 'Automations', exact: true }).waitFor();
    await page.getByRole('heading', { name: 'Sending to clients and agencies' }).waitFor();
    return { page, errors, posts };
  };
  try {
    for (const width of [1280, 390]) {
      const off = await open(width, null, () => ({ status: 500, json: {} }));
      assert.equal(await off.page.getByRole('heading', { name: 'Modes', exact: true }).count(), 0);
      assert.deepEqual(off.errors, []);
      await off.page.close();

      let stale = false;
      const on = await open(width, MODES, body => stale
        ? { status: 409, json: { error: 'Someone changed this mode first. Here is the current one.', policy: op(body.automation_id, body.operation, 'Approve', 3, 'colleague@example.test') } }
        : { json: { policy: op(body.automation_id, body.operation, body.mode, body.expected_revision + 1, 'admin@example.test') } });
      const { page } = on;
      await page.getByRole('heading', { name: 'Modes', exact: true }).waitFor();
      const select = page.getByLabel('Listing text drafts');
      assert.equal(await select.inputValue(), 'Draft');
      await select.selectOption('Auto');
      await page.getByRole('status').filter({ hasText: 'Listing text drafts: Auto.' }).waitFor();
      assert.deepEqual(on.posts.at(-1), { automation_id: 'listing_text', operation: 'prepare_draft', mode: 'Auto', expected_revision: 1 });
      stale = true;
      await page.getByLabel('Chat purpose').selectOption('Approve');
      await page.getByRole('alert').filter({ hasText: 'Someone changed this mode first' }).waitFor();
      assert.equal(await page.getByLabel('Chat purpose').inputValue(), 'Approve');
      const scroll = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      assert.ok(scroll <= 0, `no horizontal scroll at ${width} (${scroll}px)`);
      await page.screenshot({ path: `/tmp/hampton-shots/aut-10-modes-${width}.png`, fullPage: true }).catch(() => {});
      assert.deepEqual(on.errors, []);
      await page.close();
    }
  } finally { await browser.close(); }
  console.log('AUT-10 Modes card: hidden with the flag off, mode change and stale revision at 1280/390 PASS');
})().catch(error => { console.error(error); process.exitCode = 1; });
