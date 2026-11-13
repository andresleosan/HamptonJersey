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
      assert.equal(await page.getByLabel('Business premium', { exact: true }).count(), 1);
      await page.getByLabel('Business premium', { exact: true }).fill('50000');
      await page.getByLabel('Currency', { exact: true }).selectOption('GBP');
      await page.getByLabel('Interior area (sq ft)', { exact: true }).fill('800');
      await page.getByText('£15.00 per sq ft p.a.', { exact: true }).waitFor();
      assert.equal(await page.getByLabel('Calculated premium per sq ft').textContent(), '£62.50 premium per sq ft');
      assert.equal(await page.getByLabel('Calculated price per sq ft', { exact: true }).textContent(), '£15.00 per sq ft p.a.');
      await page.getByLabel('Tenure', { exact: true }).selectOption('');
      assert.equal(await page.getByLabel('Calculated price per sq ft').textContent(), '£15.00 per sq ft p.a.');
      await page.getByLabel('Tenure', { exact: true }).selectOption('leasehold');
      await page.getByLabel('Rent', { exact: true }).fill('101009.09');
      await page.getByLabel('Interior area (sq ft)', { exact: true }).fill('202');
      await page.getByText('£500.05 per sq ft p.a.', { exact: true }).waitFor();
      await page.getByLabel('Rent', { exact: true }).fill('12000');
      await page.getByLabel('Interior area (sq ft)', { exact: true }).fill('');
      assert.equal(await page.getByLabel('Calculated price per sq ft').textContent(), 'Not available with the current details');
      await page.getByLabel('Interior area (sq ft)', { exact: true }).fill('800');
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
      assert.equal(await page.getByLabel('Price per sq ft', { exact: true }).inputValue(), '£25 per sq ft per year');
      await page.getByText('£15.00 per sq ft p.a.', { exact: true }).waitFor();
      assert.equal(await page.getByLabel('Business premium', { exact: true }).inputValue(), '50000');
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      await page.goto(BASE + 'admin/#/listings/HE-C001/report?days=30');
      await page.getByText('£50,000 premium + £12,000 p.a.', { exact: true }).waitFor();
      await page.goto(BASE + 'admin/#/p/HE-C001');
      await page.getByLabel('Business premium', { exact: true }).fill('');
      await page.getByRole('button', { name: 'Save', exact: true }).click();
      await page.getByRole('status').filter({ hasText: 'Changes saved.' }).waitFor();
      await page.goto(BASE + 'admin/#/listings/HE-C001/report?days=30');
      await page.getByText('£12,000 p.a. (premium not published)', { exact: true }).waitFor();
      // The isolated report response is varied to cover legacy missing periods without changing stored data.
      let reportPeriod = null;
      const reportUrl = '**/api/admin/listings/HE-C001/report?*';
      const reportFixture = async route => {
        const response = await route.fetch();
        const data = await response.json();
        Object.assign(data.listing, { operation: 'rent', rent: 12000, rent_period: reportPeriod, premium: null });
        await route.fulfill({ response, json: data });
      };
      await page.route(reportUrl, reportFixture);
      for (const [period, label] of [[null, '£12,000'], ['month', '£12,000 pcm'], ['year', '£12,000 p.a.']]) {
        reportPeriod = period;
        await page.reload();
        await page.locator('.report-sub .price').waitFor();
        assert.equal(await page.locator('.report-sub .price').textContent(), label);
      }
      await page.unroute(reportUrl, reportFixture);
      await page.goto(BASE + 'admin/#/p/HE-C001');
      await page.getByLabel('Business premium', { exact: true }).fill('50000');
      await page.getByRole('button', { name: 'Save', exact: true }).click();
      await page.getByRole('status').filter({ hasText: 'Changes saved.' }).waitFor();
      await page.goto(BASE + 'p/HE-C001');
      await page.getByText('£50,000 premium + £12,000 p.a.', { exact: true }).first().waitFor();
      await page.getByText(`£${width} per month`, { exact: true }).waitFor();
      await page.getByText('£12,000 per year', { exact: true }).waitFor();
      await page.getByText('2027-02-28', { exact: true }).waitFor();
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      await page.goto(BASE + 'admin/#/p/HE-C001');
      await page.getByLabel('Tenure', { exact: true }).selectOption('freehold');
      await page.getByLabel('Sale price', { exact: true }).fill('1250000');
      await page.getByText('£1,562.50 per sq ft', { exact: true }).waitFor();
      assert.equal(await page.getByLabel('Rent', { exact: true }).inputValue(), '12000');
      assert.equal(await page.getByLabel('Period', { exact: true }).inputValue(), 'year');
      assert.equal(await page.getByLabel('Business premium', { exact: true }).inputValue(), '50000');
      await page.getByRole('button', { name: 'Save', exact: true }).click();
      await page.getByRole('status').filter({ hasText: 'Changes saved.' }).waitFor();
      await page.reload();
      assert.equal(await page.getByLabel('Sale price', { exact: true }).inputValue(), '1250000');
      await page.goto(BASE + 'p/HE-C001');
      await page.getByText('£50,000 premium + £12,000 p.a.', { exact: true }).first().waitFor();
      assert.equal(await page.getByText('Business, not freehold', { exact: true }).count(), 0);
      await page.getByText('£12,000 per year', { exact: true }).waitFor();
      await context.close();
    }
    console.log('PUB-06: editor and public listing passed at desktop and mobile widths.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
