// Only the isolated, networkless local fixture installs the proposal used here.
const { chromium } = require(process.env.PW || 'playwright-core');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { parseEnv } = require('node:util');
const BASE = process.env.BASE, vars = parseEnv(readFileSync(process.env.E2E_VARS, 'utf8'));
(async () => {
  const { signSession, COOKIE } = await import('../server/auth.js');
  const browser = await chromium.launch({ executablePath: process.env.CHROME });
  try {
    for (const width of [1280, 390]) {
      const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce' });
      await context.addCookies([{ name: COOKIE, value: await signSession('admin@example.test', vars.SESSION_SECRET),
        domain: new URL(BASE).hostname, path: '/', secure: true, httpOnly: true, sameSite: 'Strict' }]);
      const page = await context.newPage(), errors = [], privateCharge = width === 1280 ? '1234.56' : '1235.56';
      page.on('pageerror', error => errors.push(error.message));
      await page.goto(BASE + 'admin/#/p/HE-C001');
      await page.getByRole('heading', { name: 'Staff-only costs' }).waitFor();
      assert.equal(await page.getByLabel('Business premium', { exact: true }).count(), 0);
      await page.getByLabel('Currency', { exact: true }).selectOption('GBP');
      await page.getByLabel('Rental deposit', { exact: true }).fill('Legacy deposit text');
      await page.getByLabel('Rental deposit amount', { exact: true }).fill('0');
      await page.getByLabel('Parish rates amount', { exact: true }).fill('0.29');
      await page.getByLabel('Parish rates period', { exact: true }).selectOption('');
      await page.getByRole('button', { name: 'Save', exact: true }).click();
      await page.getByText('Choose month or year', { exact: true }).waitFor();
      assert.equal(await page.getByLabel('Parish rates amount', { exact: true }).inputValue(), '0.29');
      await page.getByLabel('Parish rates period', { exact: true }).selectOption('year');
      await page.getByLabel('Service charge amount', { exact: true }).fill(privateCharge);
      await page.getByLabel('Service charge period', { exact: true }).selectOption('month');
      await page.getByRole('button', { name: 'Save', exact: true }).click();
      await page.getByRole('status').filter({ hasText: 'Changes saved.' }).waitFor();
      await page.reload();
      await page.getByRole('heading', { name: 'Staff-only costs' }).waitFor();
      assert.equal(await page.getByLabel('Rental deposit amount', { exact: true }).inputValue(), '0');
      assert.equal(await page.getByLabel('Parish rates amount', { exact: true }).inputValue(), '0.29');
      assert.equal(await page.getByLabel('Parish rates period', { exact: true }).inputValue(), 'year');
      assert.equal(await page.getByLabel('Service charge amount', { exact: true }).inputValue(), privateCharge);
      await page.getByLabel('Service charge amount', { exact: true }).fill('1.001');
      await page.getByRole('button', { name: 'Save', exact: true }).click();
      await page.getByText('Enter an amount with up to 2 decimal places', { exact: true }).waitFor();
      assert.equal(await page.getByLabel('Service charge amount', { exact: true }).inputValue(), '1.001');
      await page.getByRole('button', { name: 'Discard', exact: true }).click();
      assert.equal(await page.getByLabel('Service charge amount', { exact: true }).inputValue(), privateCharge);
      await page.getByLabel('Parish rates amount', { exact: true }).focus();
      await page.keyboard.press('Tab');
      assert.equal(await page.evaluate(() => document.activeElement.id), 'f-parish_rates_period');
      if (width === 1280) {
        await page.evaluate(() => { document.body.style.zoom = '2'; });
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
        await page.evaluate(() => { document.body.style.zoom = ''; });
      }
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      await page.goto(BASE + 'p/HE-C001');
      await page.getByText('Legacy deposit text', { exact: true }).waitFor();
      assert.equal(await page.getByText(privateCharge, { exact: true }).count(), 0);
      assert.equal(await page.getByText('0.29', { exact: true }).count(), 0);
      await page.goto(BASE + 'admin/#/p/HE-C001');
      await page.getByLabel('Service charge amount', { exact: true }).waitFor();
      const listing = await page.evaluate(async () => {
        const response = await fetch('/api/admin/listings/HE-C001');
        if (!response.ok) throw new Error(`Fixture read failed: ${response.status}`);
        return response.json();
      });
      const other = await page.evaluate(async ({ updatedAt, width }) => {
        const response = await fetch('/api/admin/listings/HE-C001', { method: 'PUT',
          headers: { 'content-type': 'application/json' }, body: JSON.stringify({ updated_at: updatedAt, title: `Synthetic changed ${width}` }) });
        return response.status;
      }, { updatedAt: listing.listing.updated_at, width });
      assert.equal(other, 200);
      await page.getByLabel('Service charge amount', { exact: true }).fill('77');
      await page.getByRole('button', { name: 'Save', exact: true }).click();
      await page.getByText(/Someone else saved changes/).first().waitFor();
      assert.equal(await page.getByLabel('Service charge amount', { exact: true }).inputValue(), '77');
      assert.deepEqual(errors, []);
      await context.close();
    }
    console.log('PUB-06 structured costs passed on desktop and mobile in the local isolated fixture.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
