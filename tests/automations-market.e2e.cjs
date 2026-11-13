// Exercise the actual Automations component and both market children with an unavailable gate.
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { build } = require('esbuild');
const { chromium, webkit } = require(process.env.PW || 'playwright-core');
(async () => {
  assert.equal(process.env.HAMPTON_E2E_ISOLATED, '1');
  assert.equal(process.env.E2E_PRODUCTION_READONLY, '0');
  const bundle = await build({ entryPoints: ['tests/automations-market-harness.jsx'], bundle: true, write: false, platform: 'browser', format: 'iife', jsx: 'automatic' });
  const css = readFileSync('admin/src/styles.css', 'utf8');
  const browser = await (process.env.HAMPTON_E2E_BROWSER === 'webkit' ? webkit : chromium).launch({ executablePath: process.env.CHROME });
  try {
    for (const width of [1280, 390]) {
      const page = await browser.newPage({ viewport: { width, height: 900 }, reducedMotion: 'reduce' });
      const errors = [], requests = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.route('**/api/**', async route => {
        const request = route.request(), path = new URL(request.url()).pathname;
        requests.push(`${request.method()} ${path}`);
        if (request.method() !== 'GET') return route.fulfill({ status: 405, json: { error: 'Fixture is read-only' } });
        if (path === '/api/admin/automations') return route.fulfill({ json: { clock: { at: null, stopped: false }, retention: null, hermes: { at: null, stopped: false, month: { used: 0, discarded: 0, failed: 0 }, waiting: [], recent: [] }, webchat: { on: false } } });
        if (path === '/api/admin/email/settings') return route.fulfill({ status: 503, json: { error: 'Fixture unavailable' } });
        if (path === '/api/admin/market/runs' || path === '/api/admin/market/sources') return route.fulfill({ status: 404, json: { error: 'Not found' } });
        return route.fulfill({ status: 500, json: { error: 'Unexpected fixture route' } });
      });
      await page.route('**/automations-market-synthetic', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><div id="root"></div></body></html>' }));
      await page.goto(new URL('automations-market-synthetic', process.env.BASE).href);
      await page.addStyleTag({ content: css });
      await page.addScriptTag({ content: bundle.outputFiles[0].text });
      await page.getByRole('heading', { name: 'Automations', exact: true }).waitFor();
      await page.getByRole('heading', { name: 'Market inventory', exact: true }).waitFor();
      await page.getByRole('heading', { name: 'Market source access', exact: true }).waitFor();
      await page.getByText('Market inventory is not available yet.').waitFor();
      await page.getByText('Source review is not available yet.').waitFor();
      await page.getByRole('heading', { name: 'Sending to clients and agencies' }).waitFor();
      assert.equal(await page.getByRole('switch', { name: 'Web chat' }).getAttribute('aria-checked'), 'false');
      assert.ok(requests.includes('GET /api/admin/market/runs'));
      assert.ok(requests.includes('GET /api/admin/market/sources'));
      assert.ok(requests.every(request => request.startsWith('GET ')));
      assert.deepEqual(errors, []);
      await page.close();
    }
  } finally { await browser.close(); }
  console.log('Automations synthetic mounting: both market views unavailable, rest of page remains usable, 1280/390 PASS');
})().catch(error => { console.error(error); process.exitCode = 1; });
