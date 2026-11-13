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
      if (width === 1280) {
        await page.evaluate(() => { document.documentElement.style.zoom = '2'; });
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'form fits at 200% desktop zoom');
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
      if (width === 1280) {
        await page.evaluate(() => { document.documentElement.style.zoom = '2'; });
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'renewal fits at 200% desktop zoom');
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
        console.log(`KNOWN: 390px at CSS zoom 200% has legacy overflow (${actual.content}px content; ${actual.viewport}px viewport); not approved`);
      }
      assert.deepEqual(errors, []);
      await context.close();
      console.log(`ADM-20: ${width}px local core checks passed`);
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
