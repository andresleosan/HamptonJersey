// PUB-06: real local fixture, executed inside the isolated WebKit runner.
// A commercial property is for sale only: it has an asking price, no rent, no premium and no rental terms.
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
      await page.getByLabel('Category', { exact: true }).waitFor();
      assert.equal(await page.getByLabel('Category', { exact: true }).inputValue(), 'commercial');
      assert.equal(await page.getByLabel('Operation', { exact: true }).inputValue(), 'sale');
      assert.equal(await page.getByLabel('Operation', { exact: true }).isDisabled(), true, 'commercial has one operation');
      // Nothing about rent, premium or a rental applies to a commercial sale.
      for (const label of ['Rent per month (£)', 'Period', 'Business premium', 'Rental deposit', 'Utilities included', 'Available from', 'Bedrooms', 'Bathrooms'])
        assert.equal(await page.getByLabel(label, { exact: true }).count(), 0, `${label} is hidden for a commercial sale`);
      assert.equal(await page.getByLabel('Currency', { exact: true }).locator('option').count(), 1, 'GBP only');
      await page.getByLabel('Tenure', { exact: true }).selectOption('leasehold');
      await page.getByLabel('Asking price', { exact: true }).fill('1250000');
      await page.getByLabel('Interior area (sq ft)', { exact: true }).fill('800');
      await page.getByText('£1,562.50 per sq ft', { exact: true }).waitFor();
      await page.getByLabel('Tenure', { exact: true }).selectOption('');
      assert.equal(await page.getByLabel('Calculated price per sq ft').textContent(), '£1,562.50 per sq ft');
      await page.getByLabel('Tenure', { exact: true }).selectOption('leasehold');
      await page.getByLabel('Interior area (sq ft)', { exact: true }).fill('');
      assert.equal(await page.getByLabel('Calculated price per sq ft').textContent(), 'Not available with the current details');
      await page.getByLabel('Interior area (sq ft)', { exact: true }).fill('800');
      await page.getByLabel('Price per sq ft', { exact: true }).fill('£1,562 per sq ft');
      await page.getByLabel('Parish rates', { exact: true }).fill('£500 per year');
      await page.getByLabel('Service charge', { exact: true }).fill(`£${width} per month`);
      await page.getByRole('button', { name: 'Save', exact: true }).click();
      await page.getByRole('status').filter({ hasText: 'Changes saved.' }).waitFor();
      await page.reload();
      await page.getByLabel('Asking price', { exact: true }).waitFor();
      assert.equal(await page.getByLabel('Service charge', { exact: true }).inputValue(), `£${width} per month`);
      assert.equal(await page.getByLabel('Asking price', { exact: true }).inputValue(), '1250000');
      assert.equal(await page.getByLabel('Price per sq ft', { exact: true }).inputValue(), '£1,562 per sq ft');
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      await page.goto(BASE + 'admin/#/listings/HE-C001/report?days=30');
      await page.getByText('£1,250,000', { exact: true }).first().waitFor();
      await page.goto(BASE + 'p/HE-C001');
      await page.getByText('£1,250,000', { exact: true }).first().waitFor();
      await page.getByText(`£${width} per month`, { exact: true }).waitFor();
      assert.equal(await page.getByText(/premium/i).count(), 0, 'the public page never mentions a premium');
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      // The owner report reads a rent's period as the website does (a rental, shown through a varied report response).
      let reportPeriod = null;
      const reportUrl = '**/api/admin/listings/HE-C001/report?*';
      const reportFixture = async route => {
        const response = await route.fetch();
        const data = await response.json();
        Object.assign(data.listing, { operation: 'rent', rent: 12000, rent_period: reportPeriod, premium: null });
        await route.fulfill({ response, json: data });
      };
      await page.goto(BASE + 'admin/#/listings/HE-C001/report?days=30');
      await page.route(reportUrl, reportFixture);
      for (const [period, label] of [[null, '£12,000'], ['month', '£12,000 pcm'], ['year', '£12,000 p.a.']]) {
        reportPeriod = period;
        await page.reload();
        await page.locator('.report-sub .price').waitFor();
        assert.equal(await page.locator('.report-sub .price').textContent(), label);
      }
      await page.unroute(reportUrl, reportFixture);
      await context.close();
    }
    console.log('PUB-06: editor and public listing passed at desktop and mobile widths.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
