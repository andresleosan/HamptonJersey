// Local, isolated fixture only: E2E_SCRIPT=tests/listing-address.e2e.cjs npm run test:e2e.
const { chromium } = require(process.env.PW || 'playwright-core');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { parseEnv } = require('node:util');
const { execFileSync } = require('node:child_process');
const { join, dirname } = require('node:path');
const BASE = process.env.BASE, vars = parseEnv(readFileSync(process.env.E2E_VARS, 'utf8'));
const wrangler = join(dirname(require.resolve('wrangler')), '..', 'bin', 'wrangler.js');
const sql = statement => execFileSync(process.execPath,
  [wrangler, 'd1', 'execute', 'hampton', '--local', '--persist-to', process.env.E2E_PERSIST, '--json', '--command', statement],
  { encoding: 'utf8' });

(async () => {
  assert.ok(BASE && process.env.E2E_PERSIST, 'isolated local fixture required');
  const { signSession, COOKIE } = await import('../server/auth.js');
  const browser = await chromium.launch({ executablePath: process.env.CHROME });
  try {
    for (const width of [1280, 390]) {
      const at = new Date().toISOString();
      sql(`DELETE FROM listing_details WHERE listing_id='HE-R003';
        UPDATE listings SET published=1,archived_at=NULL,review_requested_at=NULL,review_requested_by=NULL,
          property_condition=NULL,country='Jersey',location='St Helier',road_name='Main Road',parish='St Helier',updated_at='${at}'
        WHERE id='HE-R003';`);
      sql(`UPDATE listings SET interior_area_sqft=NULL,separate_wcs=NULL,has_lift=NULL,heating_types=NULL,
        feature_overrides='{}' WHERE id='HE-R003';`);
      const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce' });
      await context.addCookies([{ name: COOKIE, value: await signSession('admin@example.test', vars.SESSION_SECRET),
        domain: new URL(BASE).hostname, path: '/', secure: true, httpOnly: true, sameSite: 'Strict' }]);
      const page = await context.newPage(), errors = [], dialogs = [], postalRequests = [];
      page.on('pageerror', error => errors.push(error.message));
      page.on('dialog', async dialog => { dialogs.push(dialog.message()); await dialog.dismiss(); });
      page.on('console', message => message.type() === 'error'
        && !/Failed to load resource|turnstile|challenges/i.test(message.text())
        && !/^Failed to preconnect to https:\/\/fonts\.(?:googleapis|gstatic)\.com\/\. Error: Error resolving /i.test(message.text())
        && errors.push(message.text()));
      page.on('request', request => { if (new URL(request.url()).hostname.endsWith('jerseypost.com')) postalRequests.push(request.url()); });
      const api = (path, body) => page.evaluate(async ({ path, body }) => {
        const response = await fetch('/api' + path, { method: body ? 'PUT' : 'GET',
          headers: body ? { 'content-type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined });
        return { status: response.status, data: await response.json() };
      }, { path, body });

      await page.goto(BASE + 'admin/#/p/HE-R003');
      await page.getByRole('heading', { name: 'Physical details', exact: true }).waitFor();
      const area = page.getByLabel('Interior area (sq ft)', { exact: true });
      await area.fill('1000');
      await page.getByLabel('Separate toilets', { exact: true }).fill('0');
      await page.getByLabel('Lift', { exact: true }).selectOption('0');
      const heating = page.locator('fieldset').filter({ has: page.getByText('Heating', { exact: true }) });
      await heating.getByLabel('Selection').selectOption('values');
      await page.getByRole('button', { name: 'Save', exact: true }).click();
      await heating.getByText('Choose at least one value, or choose None or Unknown').waitFor();
      await heating.getByLabel('Gas', { exact: true }).check();
      const pets = page.locator('fieldset').filter({ has: page.getByText('Pets', { exact: true }) });
      await pets.getByText(/Last saved value:/).waitFor();
      await pets.getByLabel('Source').selectOption('manual');
      await pets.getByLabel('Value').selectOption('yes');
      const parking = page.locator('fieldset').filter({ has: page.getByText('Parking', { exact: true }) });
      await parking.getByLabel('Source').selectOption('manual');
      await parking.getByLabel('Included spaces').fill('10001');
      await page.getByRole('button', { name: 'Save', exact: true }).click();
      await parking.getByText('Enter a whole number from 0 to 10000').waitFor();
      await parking.getByLabel('Source').selectOption('auto');
      await page.getByRole('button', { name: 'Save', exact: true }).click();
      await page.getByRole('status').filter({ hasText: 'Changes saved.' }).waitFor();
      let saved = (await api('/admin/listings/HE-R003')).data.listing;
      assert.equal(saved.interior_area_sqft, 1000); assert.equal(saved.separate_wcs, 0); assert.equal(saved.has_lift, 0);
      assert.deepEqual(saved.heating_types, ['gas']); assert.equal(saved.feat_pets, 'yes');
      assert.equal(saved.feature_overrides.pets, 'yes');
      assert.equal(await page.locator('#s-physical output').innerText(), '92.90');
      await area.fill('1200');
      await page.getByRole('button', { name: 'Discard', exact: true }).click();
      assert.equal(await area.inputValue(), '1000');
      await page.getByLabel('Floor level (ground floor is 0)', { exact: true }).fill('1');
      await page.getByLabel('Above-ground floors', { exact: true }).fill('1');
      await page.getByRole('button', { name: 'Save', exact: true }).click();
      await page.getByText('Floor must be below the number of above-ground floors').waitFor();
      await page.waitForFunction(() => document.activeElement?.id === 'f-floor_level');
      await page.getByRole('button', { name: 'Discard', exact: true }).click();
      await page.evaluate(() => { document.documentElement.style.zoom = '2'; });
      const overflow = await page.evaluate(() => ({ viewport: innerWidth, width: document.documentElement.scrollWidth }));
      assert.ok(overflow.width <= overflow.viewport + 1, 'no horizontal overflow at 200%');
      assert.deepEqual(errors, []); assert.deepEqual(dialogs, []);
      console.log(`PUB-05 ${width}: validation, save, manual facts, discard and CSS zoom PASS`);
      await context.close();
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
