// OFE-06 synthetic local-only fixture; execute exclusively with test:e2e:isolated.
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PW || 'playwright-core');
const { mkdtempSync, readFileSync, writeFileSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join, dirname } = require('node:path');
const { parseEnv } = require('node:util');
const { execFileSync } = require('node:child_process');
const { startFixture } = require('./serve-e2e.cjs');

(async () => {
  assert.equal(process.env.HAMPTON_E2E_ISOLATED, '1');
  assert.equal(process.env.E2E_PRODUCTION_READONLY, '0');
  assert.ok(process.env.E2E_PERSIST?.startsWith('/tmp/') && process.env.E2E_VARS?.startsWith('/tmp/'));
  const temporary = mkdtempSync(join(tmpdir(), 'ofe06-browser-'));
  const varsFile = join(temporary, 'fixture.vars');
  writeFileSync(varsFile, readFileSync(process.env.E2E_VARS, 'utf8') + '\nOFE06_WEEKLY_REVIEW_READY=1\n', { mode: 0o600 });
  const vars = parseEnv(readFileSync(varsFile, 'utf8'));
  const wrangler = join(dirname(require.resolve('wrangler')), '..', 'bin', 'wrangler.js');
  const sql = statement => execFileSync(process.execPath, [wrangler, 'd1', 'execute', 'hampton', '--local',
    '--persist-to', process.env.E2E_PERSIST, '--command', statement], { stdio: 'pipe' });
  const { signSession, COOKIE } = await import('../server/auth.js');
  let server, browser;
  try {
    server = await startFixture({ persist: process.env.E2E_PERSIST, varsFile, port: 0 });
    const base = server.url;
    assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(base.hostname));
    browser = await chromium.launch({ executablePath: process.env.CHROME });
    let n = 0;
    for (const width of [1280, 390]) {
      const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce' });
      const errors = [];
      try {
        await context.addCookies([{ name: COOKIE, value: await signSession('admin@example.test', vars.SESSION_SECRET),
          domain: base.hostname, path: '/', secure: true, httpOnly: true, sameSite: 'Strict' }]);
        // A synthetic sale through the panel's own API, then one open weekly review on it.
        const post = async (path, data) => {
          const r = await context.request.post(new URL(`api${path}`, base).href, { data, headers: { origin: base.origin } });
          assert.ok(r.ok(), `${path} ${r.status()}`);
          return r.json();
        };
        n++;
        const listing = ['HE-R001', 'HE-R006'][n - 1];
        const applicant = await post('/admin/applicants', { name: `Review buyer ${n}`, email: `ofe06-${n}@example.test`,
          source: 'phone', operation: 'buy', budget_max: 900000 });
        const { offer } = await post('/admin/offers', { listing_id: listing, applicant_id: applicant.id, amount: 600000 });
        const { sale_id } = await post(`/admin/offers/${offer.id}/accept`);
        sql(`INSERT INTO sale_followups(sale_id,week_key,task_key,created_at)
          VALUES(${sale_id},'2026-11-09','sale-followup:${sale_id}:2026-11-09',strftime('%Y-%m-%dT%H:%M:%fZ','now'));`);

        const page = await context.newPage();
        page.on('pageerror', error => errors.push(error.message));
        await page.goto(new URL('admin/#/automations', base).href);
        const card = page.locator('article[aria-labelledby="a-review"]');
        await card.waitFor();
        await card.locator('.badge').filter({ hasText: 'Off' }).waitFor();
        await card.getByLabel('Day').selectOption('tue');
        await card.getByLabel('Time (Jersey)').fill('10:30');
        await card.getByRole('button', { name: 'Turn on' }).click();
        await card.getByRole('status').filter({ hasText: 'On: every Tuesday at 10:30, Jersey time.' }).waitFor();
        await card.getByRole('button', { name: 'Turn off' }).click();
        await card.getByRole('status').filter({ hasText: 'Off. No new reviews are created.' }).waitFor();
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${width}px automations scroll`);

        await page.goto(new URL(`admin/#/sales/${sale_id}`, base).href);
        const review = page.locator('section[aria-labelledby="h-review"]');
        await review.getByText('Week of', { exact: false }).first().waitFor();
        await review.getByLabel('Internal note (optional)').fill('Searches chased');
        await review.getByRole('button', { name: 'Mark reviewed' }).click();
        await review.getByRole('status').filter({ hasText: 'reviewed.' }).waitFor();
        await review.getByText('reviewed by admin@example.test', { exact: false }).waitFor();

        const outside = page.locator('section[aria-labelledby="h-outside"]');
        const record = outside.getByRole('button', { name: 'Record step' });
        await record.focus();
        await page.keyboard.press('Enter');
        await outside.getByText('Choose who it was with').waitFor();
        assert.equal(await page.evaluate(() => document.activeElement?.id), 'xs-party', 'focus goes to the first error');
        await outside.getByLabel('With').selectOption('buyer_lawyer');
        await outside.getByLabel('Reference').fill('Email, searches requested');
        await record.click();
        await outside.getByRole('status').filter({ hasText: 'Step recorded.' }).waitFor();
        await outside.getByText("Buyer's lawyer · Email, searches requested", { exact: false }).waitFor();
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${width}px sale scroll`);
        await page.screenshot({ path: `/tmp/hampton-shots/ofe06-${width}.png`, fullPage: true }).catch(() => {});
        assert.deepEqual(errors, []);
        console.log(`OFE-06 ${width}px: schedule, weekly review and outside step passed.`);
      } finally {
        await context.close();
      }
    }
  } finally {
    if (browser) await browser.close();
    if (server) await server.close();
    rmSync(temporary, { recursive: true, force: true });
  }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
