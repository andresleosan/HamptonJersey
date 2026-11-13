// PUB-06: real local fixture, executed inside the isolated WebKit runner.
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
      const page = await context.newPage();
      await page.goto(BASE + 'admin/#/p/HE-C001');
      await page.getByLabel('Tenure', { exact: true }).selectOption('leasehold');
      await page.getByLabel('Rent', { exact: true }).fill('12000');
      await page.getByLabel('Period', { exact: true }).selectOption('year');
      assert.equal(await page.getByLabel('Business premium', { exact: true }).count(), 0);
      await page.getByLabel('Currency', { exact: true }).selectOption('GBP');
      await page.getByLabel('Price per sq ft', { exact: true }).fill('£25 per sq ft per year');
      await page.getByLabel('Rental deposit', { exact: true }).fill('£2,000');
      await page.getByLabel('Parish rates', { exact: true }).fill('£500 per year');
      await page.getByLabel('Service charge', { exact: true }).fill(`£${width} per month`);
      await page.getByLabel('Utilities included', { exact: true }).fill('Water');
      await page.getByLabel('Available from', { exact: true }).fill('2027-02-28');
      await page.getByRole('button', { name: 'Save', exact: true }).click();
      await page.getByRole('status').filter({ hasText: 'Changes saved.' }).waitFor();
      await page.reload();
      await page.getByLabel('Rent', { exact: true }).waitFor();
      assert.equal(await page.getByLabel('Service charge', { exact: true }).inputValue(), `£${width} per month`);
      assert.equal(await page.getByLabel('Rent', { exact: true }).inputValue(), '12000');
      assert.equal(await page.getByLabel('Business premium', { exact: true }).count(), 0);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      await page.goto(BASE + 'p/HE-C001');
      await page.getByText(`£${width} per month`, { exact: true }).waitFor();
      await page.getByText('£12,000 per year', { exact: true }).waitFor();
      await page.getByText('2027-02-28', { exact: true }).waitFor();
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      await page.goto(BASE + 'admin/#/p/HE-C001');
      await page.getByLabel('Tenure', { exact: true }).selectOption('freehold');
      await page.getByLabel('Sale price', { exact: true }).fill('1250000');
      assert.equal(await page.getByLabel('Rent', { exact: true }).count(), 0);
      assert.equal(await page.getByLabel('Period', { exact: true }).count(), 0);
      assert.equal(await page.getByLabel('Business premium', { exact: true }).count(), 0);
      await page.getByRole('button', { name: 'Save', exact: true }).click();
      await page.getByRole('status').filter({ hasText: 'Changes saved.' }).waitFor();
      await page.reload();
      assert.equal(await page.getByLabel('Sale price', { exact: true }).inputValue(), '1250000');
      await page.goto(BASE + 'p/HE-C001');
      await page.getByText('£1,250,000', { exact: true }).first().waitFor();
      assert.equal(await page.getByText('Business, not freehold', { exact: true }).count(), 0);
      assert.equal(await page.getByText('£12,000 per year', { exact: true }).count(), 0);
      await context.close();
    }
    console.log('PUB-06: editor and public listing passed at desktop and mobile widths.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
