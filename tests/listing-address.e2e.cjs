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
      const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce' });
      await context.addCookies([{ name: COOKIE, value: await signSession('admin@example.test', vars.SESSION_SECRET),
        domain: new URL(BASE).hostname, path: '/', secure: true, httpOnly: true, sameSite: 'Strict' }]);
      const page = await context.newPage(), errors = [], dialogs = [], postalRequests = [];
      page.on('pageerror', error => errors.push(error.message));
      page.on('dialog', async dialog => { dialogs.push(dialog.message()); await dialog.dismiss(); });
      page.on('console', message => message.type() === 'error'
        && !/Failed to load resource|turnstile|challenges/i.test(message.text()) && errors.push(message.text()));
      page.on('request', request => { if (new URL(request.url()).hostname.endsWith('jerseypost.com')) postalRequests.push(request.url()); });
      const api = (path, body) => page.evaluate(async ({ path, body }) => {
        const response = await fetch('/api' + path, { method: body ? 'PUT' : 'GET',
          headers: body ? { 'content-type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined });
        return { status: response.status, data: await response.json() };
      }, { path, body });

      await page.goto(BASE + 'admin/#/p/HE-R003');
      await page.getByRole('heading', { name: 'Internal property details', exact: true }).waitFor();
      const internal = page.locator('#s-internal-address');
      assert.equal(await page.getByLabel('Public location', { exact: true }).inputValue(), 'St Helier');
      await page.getByLabel('Building name or number (internal)', { exact: true }).fill('Fixture <img src=x onerror=alert(1)>');
      await page.getByLabel('Postcode (internal)', { exact: true }).fill('je23ab');
      await page.getByLabel('Property condition', { exact: true }).selectOption('new_build');
      await page.getByLabel('Developer (internal)', { exact: true }).fill('Fixture Developer');
      await internal.getByText(/Fixture <img src=x onerror=alert\(1\)>, Main Road, St Helier, je23ab, Jersey/).waitFor();
      assert.equal(await internal.locator('img').count(), 0, 'typed text is rendered as text');
      await page.getByRole('button', { name: 'Save', exact: true }).click();
      await page.getByRole('status').filter({ hasText: 'Changes saved.' }).waitFor();
      let details = (await api('/admin/listings/HE-R003')).data.details;
      assert.deepEqual(details, { building_name_or_number: 'Fixture <img src=x onerror=alert(1)>', postcode: 'JE2 3AB',
        property_condition: 'new_build', developer_name: 'Fixture Developer', public_address_snapshot: null,
        public_address_snapshot_hash: null, public_address_evidence_ref: null, public_address_reviewed_by: null, public_address_reviewed_at: null });
      assert.ok(await internal.getByText('Format checked only. The address has not been verified.').count());
      const publicListings = (await api('/listings')).data;
      const publicListing = publicListings.find(listing => listing.id === 'HE-R003');
      assert.ok(publicListing);
      assert.equal('exactAddress' in publicListing, false);
      for (const key of ['building_name_or_number', 'postcode', 'property_condition', 'developer_name']) assert.equal(key in publicListing, false);
      assert.equal(JSON.stringify(publicListing).includes('Fixture Developer'), false);
      assert.deepEqual(postalRequests, [], 'the address finder is not queried automatically');

      await page.getByRole('button', { name: 'Review public snapshot', exact: true }).click();
      await page.getByRole('heading', { name: 'Review the public snapshot', exact: true }).waitFor();
      assert.ok(await page.getByText('Fixture <img src=x onerror=alert(1)>, Main Road, St Helier, JE2 3AB, Jersey', { exact: true }).count());
      await page.getByLabel('Consent evidence reference', { exact: true }).fill('fixture:e2e-owner-consent');
      await page.getByLabel("I reviewed this snapshot and have the owner's agreement to publish the exact address", { exact: true }).check();
      await page.getByRole('button', { name: 'Authorize and publish exact address', exact: true }).click();
      await page.getByRole('status').filter({ hasText: 'Public exact address reviewed and published.' }).waitFor();
      details = (await api('/admin/listings/HE-R003')).data.details;
      assert.equal(details.public_address_snapshot, 'Fixture <img src=x onerror=alert(1)>, Main Road, St Helier, JE2 3AB, Jersey');
      assert.equal(details.public_address_evidence_ref, 'fixture:e2e-owner-consent');
      const optedIn = (await api('/listings')).data.find(listing => listing.id === 'HE-R003');
      assert.equal(optedIn.exactAddress, details.public_address_snapshot);
      assert.equal(JSON.stringify(optedIn).includes('Fixture Developer'), false);
      await page.goto(BASE + 'p/HE-R003');
      await page.getByText(details.public_address_snapshot, { exact: true }).waitFor();
      assert.equal(await page.locator('#app img[onerror]').count(), 0, 'public address is escaped as text');
      await page.goto(BASE + 'admin/#/p/HE-R003');
      await page.getByRole('heading', { name: 'Internal property details', exact: true }).waitFor();
      await page.getByRole('button', { name: 'Review updated public snapshot', exact: true }).waitFor();

      await page.getByLabel('Property condition', { exact: true }).selectOption('existing');
      assert.equal(await page.getByLabel('Developer (internal)', { exact: true }).inputValue(), 'Fixture Developer');
      await internal.getByText('Only applies to new builds. Clear this value if it no longer applies.').waitFor();
      await page.getByRole('button', { name: 'Discard', exact: true }).click();
      assert.equal(await page.getByLabel('Property condition', { exact: true }).inputValue(), 'new_build');
      assert.equal(await page.getByLabel('Developer (internal)', { exact: true }).inputValue(), 'Fixture Developer');

      const building = page.getByLabel('Building name or number (internal)', { exact: true });
      await building.focus(); await page.keyboard.press('Tab');
      assert.equal(await page.evaluate(() => document.activeElement.id), 'f-postcode');
      await building.fill('Draft retained after conflict');
      await page.route('**/api/admin/listings/HE-R003', route => route.fulfill({ status: 409,
        contentType: 'application/json', body: JSON.stringify({ error: 'Reload fixture version' }) }), { times: 1 });
      await page.getByRole('button', { name: 'Save', exact: true }).click();
      await page.getByRole('alert').filter({ hasText: 'Reload fixture version' }).waitFor();
      assert.equal(await building.inputValue(), 'Draft retained after conflict');
      await page.getByRole('button', { name: 'Save', exact: true }).click();
      await page.getByRole('status').filter({ hasText: 'Changes saved.' }).waitFor();

      const postcode = page.getByLabel('Postcode (internal)', { exact: true });
      await postcode.fill('not-a-JE-code');
      await page.getByRole('button', { name: 'Save', exact: true }).click();
      await page.getByRole('alert').filter({ hasText: 'Please check the highlighted fields' }).waitFor();
      await page.waitForFunction(() => document.activeElement?.id === 'f-postcode');
      assert.equal(await postcode.getAttribute('aria-invalid'), 'true');
      assert.equal(await page.locator('#e-postcode').count(), 1);
      assert.deepEqual(dialogs, []);

      await page.evaluate(() => { document.documentElement.style.zoom = '2'; });
      const overflow = await page.evaluate(() => ({ viewport: innerWidth, width: document.documentElement.scrollWidth }));
      assert.ok(overflow.width <= overflow.viewport + 1, `no horizontal overflow at 200%: ${JSON.stringify(overflow)}`);
      assert.deepEqual(errors, []);
      console.log(`PUB-04 ${width}: private fields, normalization, discard, error focus, keyboard, privacy and 200% zoom PASS`);
      await context.close();
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
