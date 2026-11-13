// Local synthetic fixture only: run through test:e2e:isolated.
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PW || 'playwright-core');
const { readFileSync } = require('node:fs');
const { parseEnv } = require('node:util');
const BASE = process.env.BASE;
const request = (page, path, method = 'GET', body) => page.evaluate(async ({ path, method, body }) => {
  const response = await fetch('/api' + path, { method, credentials: 'same-origin',
    headers: body ? { 'Content-Type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined });
  return { status: response.status, data: await response.json() };
}, { path, method, body });

(async () => {
  assert.ok(BASE && process.env.E2E_PERSIST && process.env.E2E_VARS, 'isolated fixture required');
  const vars = parseEnv(readFileSync(process.env.E2E_VARS, 'utf8'));
  const { signSession, COOKIE } = await import('../server/auth.js');
  const browser = await chromium.launch({ executablePath: process.env.CHROME });
  try {
    for (const width of [1280, 390, 320]) {
      const context = await browser.newContext({ viewport: { width, height: 900 }, timezoneId: 'Europe/Jersey', reducedMotion: 'reduce' });
      await context.addCookies([{ name: COOKIE, value: await signSession('admin@example.test', vars.SESSION_SECRET),
        domain: new URL(BASE).hostname, path: '/', httpOnly: true, secure: true, sameSite: 'Strict' }]);
      const page = await context.newPage(), errors = [];
      page.on('pageerror', error => errors.push(error.message));
      page.setDefaultTimeout(9000);
      await page.goto(new URL('admin/#/rentals', BASE).href);
      await page.getByRole('heading', { name: 'Rentals', exact: true }).waitFor();
      const owner = await request(page, '/admin/landlords', 'POST', { name: `Synthetic ADM20 owner ${width}` });
      assert.equal(owner.status, 201);
      const property = await request(page, '/admin/rentals', 'POST', { landlord_id: owner.data.landlord.id,
        address: `Synthetic ADM20 property ${width}`, parish: 'St Helier', service: 'let_only' });
      assert.equal(property.status, 201);
      await page.goto(new URL(`admin/#/rentals/${property.data.rental.id}`, BASE).href);
      await page.getByRole('button', { name: 'New tenancy', exact: true }).click();
      const form = page.locator('#new-tenancy');
      await form.getByText(/this selection does not verify it/i).waitFor();
      await form.getByText(/premium or key money/i).waitFor();
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'form fits at normal zoom');
      if (width === 1280 || width === 390) {
        await page.evaluate(() => { document.documentElement.style.zoom = '2'; });
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'form fits at 200% zoom');
        await page.evaluate(() => { document.documentElement.style.zoom = '1'; });
      }
      await form.getByLabel("Tenant's name").fill(`Synthetic tenant ${width}`);
      await form.getByRole('radio', { name: 'Fixed term', exact: true }).check();
      await form.getByRole('radio', { name: '2011 law', exact: true }).check();
      await form.getByLabel('Start date', { exact: true }).fill('2025-01-01');
      await form.getByLabel('End of the fixed term', { exact: true }).fill('2028-01-01');
      assert.equal(await form.getByText(/dates entered extend beyond three calendar years/i).count(), 0);
      await form.getByLabel('End of the fixed term', { exact: true }).fill('2028-01-02');
      await form.getByText(/dates entered extend beyond three calendar years/i).waitFor();
      await form.getByLabel('Rent (£ pcm)', { exact: true }).fill('1000');
      await form.getByRole('button', { name: 'Add tenancy', exact: true }).click();
      await page.getByText('Recorded law label: 2011 (not verified)', { exact: true }).waitFor();
      const record = await request(page, `/admin/rentals/${property.data.rental.id}`);
      assert.equal(record.status, 200);
      const id = record.data.tenancies[0].id;
      await page.locator(`#tenancy-${id}`).getByRole('button', { name: 'Renew', exact: true }).click();
      const modal = page.getByRole('dialog', { name: 'Renew tenancy', exact: true });
      await modal.getByText(/previously recorded law label stays/i).waitFor();
      await modal.getByText(/further fixed term or extension may be restricted/i).waitFor();
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'renewal fits at normal zoom');
      if (width === 1280 || width === 390) {
        await page.evaluate(() => { document.documentElement.style.zoom = '2'; });
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'renewal page fits at 200% zoom');
        assert.ok(await modal.evaluate(el => el.scrollWidth <= el.clientWidth + 1), 'renewal dialog fits at 200% zoom');
        await page.evaluate(() => { document.documentElement.style.zoom = '1'; });
      }
      await modal.getByRole('radio', { name: 'Periodic', exact: true }).check();
      assert.equal(await modal.getByText(/further fixed term or extension may be restricted/i).count(), 0);
      await modal.getByRole('button', { name: 'Renew', exact: true }).focus();
      assert.equal(await modal.getByRole('button', { name: 'Renew', exact: true }).evaluate(el => el === document.activeElement), true);
      await modal.getByRole('button', { name: 'Renew', exact: true }).click();
      await modal.waitFor({ state: 'hidden' });
      const updated = await request(page, `/admin/tenancies/${id}`);
      assert.equal(updated.status, 200);
      assert.equal(updated.data.tenancy.regime, '2011');
      assert.equal(updated.data.tenancy.kind, 'periodic');
      if (width === 390) {
        await page.evaluate(() => { document.documentElement.style.zoom = '2'; });
        const actual = await page.evaluate(() => ({ viewport: innerWidth, content: document.documentElement.scrollWidth }));
        assert.ok(actual.content <= actual.viewport + 1, `rental detail fits at 390px and 200% zoom: ${actual.content}px content in ${actual.viewport}px viewport`);
        await page.evaluate(() => { document.documentElement.style.zoom = '1'; });
        const second = await request(page, '/admin/rentals', 'POST', { landlord_id: owner.data.landlord.id,
          address: 'Synthetic second ADM20 property', parish: 'St Helier', service: 'let_only' });
        assert.equal(second.status, 201);
        const secondTenancy = await request(page, `/admin/rentals/${second.data.rental.id}/tenancies`, 'POST', {
          tenant_name: 'Synthetic second tenant', kind: 'fixed', regime: '2025', start_on: '2025-01-01', end_on: '2028-01-01', rent: 1000 });
        assert.equal(secondTenancy.status, 201);
        assert.equal((await request(page, '/admin/settings/rpi', 'PUT', { percent: 3.2, as_of: '2026-01-01' })).status, 200);
        await page.goto(new URL(`admin/#/rentals/${second.data.rental.id}`, BASE).href);
        const opener = page.locator(`#tenancy-${secondTenancy.data.tenancy.id}`).getByRole('button', { name: 'Change rent', exact: true });
        await opener.click();
        const rentDialog = page.getByRole('dialog', { name: 'Change rent', exact: true });
        await rentDialog.getByText(/does not confirm which rules apply/i).waitFor();
        const useEstimate = rentDialog.getByRole('button', { name: /^Use estimate in form/ });
        await useEstimate.waitFor();
        await page.evaluate(() => { document.documentElement.style.zoom = '2'; });
        assert.ok(await rentDialog.evaluate(el => el.scrollWidth <= el.clientWidth + 1), 'rent estimate dialog fits at 200% zoom');
        await useEstimate.click();
        assert.ok(await rentDialog.getByLabel('New rent (£ pcm)').inputValue(), 'estimate is copied to the form');
        const unchanged = await request(page, `/admin/tenancies/${secondTenancy.data.tenancy.id}`);
        assert.equal(unchanged.data.tenancy.rent, 1000, 'copying an estimate does not save the rent');
        await page.keyboard.press('Escape');
        await rentDialog.waitFor({ state: 'hidden' });
        assert.equal(await opener.evaluate(el => el === document.activeElement), true, 'focus returns to the opener');
      }
      assert.deepEqual(errors, []);
      await context.close();
      console.log(`ADM-20: ${width}px local core checks passed`);
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
