// The category decides the form (Luis, 19-nov): Residential is sold or let; Commercial and International are for sale
// only, with an asking price. Local fixture only, inside the isolated runner.
const { chromium } = require(process.env.PW || 'playwright-core');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { parseEnv } = require('node:util');
const BASE = process.env.BASE, vars = parseEnv(readFileSync(process.env.E2E_VARS, 'utf8'));
const shown = (page, label) => page.getByLabel(label, { exact: true }).count();
const options = locator => locator.locator('option').evaluateAll(o => o.map(x => x.value));
(async () => {
  const { signSession, COOKIE } = await import('../server/auth.js');
  const browser = await chromium.launch({ executablePath: process.env.CHROME });
  try {
    for (const width of [1280, 390]) {
      const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce' });
      await context.addCookies([{ name: COOKIE, value: await signSession('admin@example.test', vars.SESSION_SECRET),
        domain: new URL(BASE).hostname, path: '/', secure: true, httpOnly: true, sameSite: 'Strict' }]);
      const page = await context.newPage(), errors = [];
      page.on('pageerror', e => errors.push(e.message));
      const category = page.getByLabel('Category', { exact: true }), operation = page.getByLabel('Operation', { exact: true });
      const availability = page.getByLabel('Availability', { exact: true });

      // A Jersey home for sale: sale or rent, the sale states, an asking price, no tenure.
      await page.goto(BASE + 'admin/#/p/HE-R001');
      await category.waitFor();
      assert.deepEqual(await options(category), ['residential', 'commercial', 'international']);
      assert.equal(await category.inputValue(), 'residential');
      assert.deepEqual(await options(operation), ['sale', 'rent']);
      assert.equal(await operation.isDisabled(), false);
      assert.deepEqual(await options(availability), ['for_sale', 'under_offer', 'sold', 'withdrawn']);
      assert.equal(await shown(page, 'Asking price'), 1);
      assert.equal(await shown(page, 'Tenure'), 0);
      assert.equal(await shown(page, 'Housing category'), 1);
      assert.equal(await shown(page, 'Business premium'), 0);

      // Let it: the price becomes a monthly rent, the availability To let, and the rental terms appear.
      await operation.selectOption('rent');
      assert.equal(await availability.inputValue(), 'to_let');
      assert.deepEqual(await options(availability), ['to_let', 'withdrawn']);
      assert.equal(await shown(page, 'Asking price'), 0);
      assert.equal(await shown(page, 'Rent per month (£)'), 1);
      for (const label of ['Rental deposit', 'Utilities included', 'Available from']) assert.equal(await shown(page, label), 1, label);
      assert.equal(await page.getByLabel('Restriction', { exact: true }).locator('option[value="first_time_buyer"]').count(), 0);

      // Commercial: for sale only, an asking price, a tenure; no rooms, housing, rent or rental terms.
      await category.selectOption('commercial');
      assert.equal(await operation.inputValue(), 'sale');
      assert.equal(await operation.isDisabled(), true);
      assert.equal(await availability.inputValue(), 'for_sale');
      assert.equal(await shown(page, 'Asking price'), 1);
      assert.equal(await shown(page, 'Tenure'), 1);
      assert.equal(await shown(page, 'Price per sq ft'), 1);
      for (const label of ['Rent per month (£)', 'Bedrooms', 'Bathrooms', 'Housing category', 'Restriction', 'Rental deposit', 'Available from'])
        assert.equal(await shown(page, label), 0, label);
      assert.deepEqual(await options(page.getByLabel('Currency', { exact: true })), ['GBP']);

      // International: for sale only, a country of its own, GBP or EUR, no parish or tenure.
      await category.selectOption('international');
      assert.equal(await page.getByLabel('Country', { exact: true }).inputValue(), '');
      assert.equal(await operation.isDisabled(), true);
      assert.deepEqual(await options(page.getByLabel('Currency', { exact: true })), ['GBP', 'EUR']);
      for (const label of ['Parish', 'Tenure', 'Parish rates', 'Rent per month (£)']) assert.equal(await shown(page, label), 0, label);
      assert.equal(await shown(page, 'Bedrooms'), 1);
      assert.equal(await page.getByRole('button', { name: 'Enter the country' }).count(), 1);
      await page.getByRole('button', { name: 'Discard', exact: true }).click();
      assert.equal(await category.inputValue(), 'residential');
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));

      // The café (seeded as commercial) shows its asking price and, as a sale, cannot be let.
      await page.goto(BASE + 'admin/#/p/HE-C001');
      await category.waitFor();
      assert.equal(await category.inputValue(), 'commercial');
      assert.equal(await operation.isDisabled(), true);

      if (width === 1280) {
        // The server refuses what the form no longer offers, whatever sends it.
        const refused = await page.evaluate(async () => {
          const { listing } = await (await fetch('/api/admin/listings/HE-C001')).json();
          const put = async body => { const r = await fetch('/api/admin/listings/HE-C001', { method: 'PUT',
            headers: { 'content-type': 'application/json' }, body: JSON.stringify({ updated_at: listing.updated_at, ...body }) });
            return [r.status, Object.keys((await r.json()).fields ?? {})]; };
          return [await put({ operation: 'rent', availability: 'to_let', rent: 900, rent_period: 'month', currency: 'GBP' }),
            await put({ premium: 50000, currency: 'GBP' })];
        });
        assert.equal(refused[0][0], 400); assert.ok(refused[0][1].includes('operation'));
        assert.equal(refused[1][0], 400); assert.ok(refused[1][1].includes('premium'));

        // Add new property follows the same rules.
        await page.goto(BASE + 'admin/#/listings');
        await page.getByRole('button', { name: 'Add new property' }).first().click();
        const form = page.locator('form.add-property');
        await form.getByLabel('Category').selectOption('commercial');
        assert.equal(await form.getByLabel('Operation').isDisabled(), true);
        assert.deepEqual(await options(form.getByLabel('Availability')), ['for_sale', 'under_offer', 'sold', 'withdrawn']);
        await form.getByLabel('Category').selectOption('residential');
        await form.getByLabel('Operation').selectOption('rent');
        assert.equal(await form.getByLabel('Availability').inputValue(), 'to_let');
        await form.getByRole('button', { name: 'Cancel' }).click();
      }

      // The website: the Commercial button lists the commercial property, Buy does not.
      await page.goto(BASE + 'properties');
      await page.click('.op-buttons button[data-op="business"]');
      await page.locator('#grid a[href="/p/HE-C001"]').waitFor();
      await page.click('.op-buttons button[data-op="sale"]');
      await page.locator('#grid').waitFor();
      assert.equal(await page.locator('#grid a[href="/p/HE-C001"]').count(), 0);
      assert.deepEqual(errors, []);
      await context.close();
    }
    console.log('Listing category: editor, new property, server and website passed at desktop and mobile widths.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
