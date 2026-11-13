const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { build } = require('esbuild');
const { chromium, webkit } = require(process.env.PW || 'playwright-core');
(async () => {
  assert.equal(process.env.HAMPTON_E2E_ISOLATED, '1');
  assert.equal(process.env.E2E_PRODUCTION_READONLY, '0');
  const bundle = await build({ entryPoints: ['tests/est10-work-labels-harness.jsx'], bundle: true, write: false, platform: 'browser', format: 'iife', jsx: 'automatic' });
  const css = readFileSync('admin/src/styles.css', 'utf8');
  const browser = await (process.env.HAMPTON_E2E_BROWSER === 'webkit' ? webkit : chromium).launch({ executablePath: process.env.CHROME });
  try {
    for (const width of [1280, 390]) {
      const page = await browser.newPage({ viewport: { width, height: 900 }, reducedMotion: 'reduce' });
      const errors = [], requested = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.route('**/api/**', async route => {
        const url = new URL(route.request().url());
        if (route.request().method() !== 'GET') return route.fulfill({ status: 405, json: { error: 'Read-only fixture' } });
        if (url.pathname === '/api/admin/users') return route.fulfill({ json: { users: [] } });
        if (url.pathname !== '/api/admin/applicants') return route.fulfill({ status: 500, json: { error: 'Unexpected fixture route' } });
        const label = url.searchParams.get('work_label'); requested.push(label);
        const common = { operation: 'rent', search_category: 'residential', stage: 'searching', search_state: 'active', archived_at: null,
          lost_reason: null, retention_review: 0, expires_on: null, created_at: '2026-11-13T12:00:00.000Z', last_contact_at: '2026-11-13T12:00:00.000Z', gone_quiet: 0,
          assigned_to: null, email: null, phone: null };
        const rows = [
          { ...common, id: 1, name: 'Fixture One', queue: 'New properties found', found: 2, shortlisted: 1 },
          { ...common, id: 2, name: 'Fixture Two', queue: 'No matches', found: 0, shortlisted: 0 },
          { ...common, id: 3, name: 'Fixture Three', queue: null, found: 0, shortlisted: 0, search_state: 'resolved' },
        ];
        return route.fulfill({ json: { applicants: label === 'no_pending' ? rows.filter(x => x.id === 2) : label ? rows.filter(x => x.id === 1) : rows } });
      });
      await page.route('**/est10-synthetic', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><div id="root"></div></body></html>' }));
      await page.goto(new URL('est10-synthetic', process.env.BASE).href);
      await page.addStyleTag({ content: css });
      await page.addScriptTag({ content: bundle.outputFiles[0].text });
      const row = page.getByRole('row').filter({ hasText: 'Fixture One' });
      await row.waitFor();
      for (const label of ['New properties found', 'Waiting for review', 'Shortlisted']) await row.getByText(label, { exact: true }).waitFor();
      assert.equal(await row.getByText('In process', { exact: true }).count(), 0);
      await page.locator('td').getByText('No matches awaiting review or shortlisted').waitFor();
      await page.getByText('History only').waitFor();
      await page.getByText(/shortlisted does not mean availability is confirmed/).waitFor();
      const filter = page.getByLabel('Work label');
      await filter.focus();
      assert.equal(await filter.evaluate(el => document.activeElement === el), true);
      await filter.selectOption('shortlisted');
      await page.getByText('1 applicant', { exact: true }).waitFor();
      assert.equal(requested.at(-1), 'shortlisted');
      assert.equal(await page.getByText('Fixture Two').count(), 0);
      await filter.selectOption('no_pending');
      await page.getByText('Fixture Two').waitFor();
      assert.equal(requested.at(-1), 'no_pending');
      assert.equal(await page.getByText('Fixture One').count(), 0);
      await filter.selectOption('shortlisted');
      await row.waitFor();
      await page.evaluate(() => { document.body.style.zoom = '2'; });
      for (const label of ['New properties found', 'Waiting for review', 'Shortlisted']) assert.equal(await row.getByText(label, { exact: true }).isVisible(), true);
      assert.deepEqual(errors, []);
      await page.close();
    }
  } finally { await browser.close(); }
  console.log('EST-10 synthetic work labels: combined labels, filters, desktop/mobile and zoom PASS');
})().catch(error => { console.error(error); process.exitCode = 1; });
