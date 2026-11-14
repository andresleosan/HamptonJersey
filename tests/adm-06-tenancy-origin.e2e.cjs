// ADM-06, local synthetic fixture only (run through test:e2e:isolated with ADM06_TENANCY_ORIGIN_READY=1 from run-e2e.cjs):
// a tenancy from a Let agreed listing, its signed-contract reference and its entry inventory, at 1280 and 390 px.
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PW || 'playwright-core');
const { readFileSync } = require('node:fs');
const { parseEnv } = require('node:util');
const { execFileSync } = require('node:child_process');
const { join, dirname } = require('node:path');
const BASE = process.env.BASE;
const wrangler = join(dirname(require.resolve('wrangler')), '..', 'bin', 'wrangler.js');
const sql = statement => execFileSync(process.execPath, [wrangler, 'd1', 'execute', 'hampton', '--local',
  '--persist-to', process.env.E2E_PERSIST, '--command', statement], { stdio: 'pipe' });
const request = (page, path, method = 'GET', body) => page.evaluate(async ({ path, method, body }) => {
  const response = await fetch('/api' + path, { method, credentials: 'same-origin',
    headers: body ? { 'Content-Type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined });
  return { status: response.status, data: await response.json() };
}, { path, method, body });
const fits = page => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1);

(async () => {
  assert.ok(BASE && process.env.E2E_PERSIST && process.env.E2E_VARS, 'isolated fixture required');
  const vars = parseEnv(readFileSync(process.env.E2E_VARS, 'utf8'));
  assert.equal(vars.ADM06_TENANCY_ORIGIN_READY, '1');
  const { signSession, COOKIE } = await import('../server/auth.js');
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Jersey', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const browser = await chromium.launch({ executablePath: process.env.CHROME });
  try {
    for (const width of [1280, 390]) {
      const L = `HE-Z${width}`, TS = '2026-10-07T10:00:00.000Z';
      sql(`INSERT INTO listings (id, use, title, operation, availability, rent, rent_period, specs, published, created_at, updated_at)
        VALUES ('${L}', 'residential', 'Synthetic flat ${width}', 'rent', 'let_agreed', 1300, 'month', '[]', 0, '${TS}', '${TS}');
        INSERT INTO contacts (name, email, last_activity_at, created_at, updated_at)
        VALUES ('Synthetic applicant ${width}', 'adm06-${width}@example.test', '${TS}', '${TS}', '${TS}');
        INSERT INTO applicants (contact_id, operation, stage, source, created_at, updated_at)
        VALUES ((SELECT MAX(id) FROM contacts), 'rent', 'agreed', 'web', '${TS}', '${TS}');`);
      const context = await browser.newContext({ viewport: { width, height: 900 }, timezoneId: 'Europe/Jersey', reducedMotion: 'reduce' });
      await context.addCookies([{ name: COOKIE, value: await signSession('admin@example.test', vars.SESSION_SECRET),
        domain: new URL(BASE).hostname, path: '/', httpOnly: true, secure: true, sameSite: 'Strict' }]);
      const page = await context.newPage(), errors = [];
      page.on('pageerror', error => errors.push(error.message));
      page.setDefaultTimeout(9000);
      await page.goto(new URL('admin/#/rentals', BASE).href);
      await page.getByRole('heading', { name: 'Rentals', exact: true }).waitFor();
      const owner = await request(page, '/admin/landlords', 'POST', { name: `Synthetic ADM06 owner ${width}` });
      const property = await request(page, '/admin/rentals', 'POST', { landlord_id: owner.data.landlord.id,
        address: `Synthetic flat ${width}`, parish: 'St Helier', service: 'let_only' });
      assert.equal(property.status, 201);
      const rid = property.data.rental.id;
      await page.goto(new URL(`admin/#/rentals/${rid}`, BASE).href);

      // Selection: explicit, validated, keyboard reachable.
      const start = page.getByRole('button', { name: 'From Let agreed', exact: true });
      await start.focus(); await page.keyboard.press('Enter');
      const card = page.locator('section[aria-labelledby="h-new-tenancy"]');
      await card.getByRole('button', { name: 'Preview', exact: true }).click();
      await card.getByText('Choose the Let agreed listing', { exact: true }).waitFor();
      assert.equal(await card.getByLabel('Let agreed listing').evaluate(el => el === document.activeElement), true, 'focus on the first error');
      await card.getByLabel('Let agreed listing').selectOption(L);
      await card.getByLabel('Applicant').selectOption({ label: `Synthetic applicant ${width}, agreed` });
      await card.getByLabel('Signed contract reference (optional)').fill(`Signed lease, folder S-${width}`);
      await card.getByRole('button', { name: 'Preview', exact: true }).click();
      await card.getByRole('heading', { name: 'Before you confirm' }).waitFor();
      await card.getByText(`${L}: Synthetic flat ${width} (not published)`).waitFor();
      assert.equal(await card.getByLabel("Tenant's name").inputValue(), `Synthetic applicant ${width}`);
      assert.equal(await card.getByLabel('Rent (£ pcm)').inputValue(), '1,300');
      assert.ok(await fits(page), 'preview fits');
      await page.evaluate(() => { document.documentElement.style.zoom = '2'; });
      assert.ok(await fits(page), 'preview fits at 200% zoom');
      await page.evaluate(() => { document.documentElement.style.zoom = '1'; });
      await card.getByRole('radio', { name: 'Periodic', exact: true }).check();
      await card.getByRole('radio', { name: '2025 law', exact: true }).check();
      await card.getByLabel('Start date', { exact: true }).fill(today);
      await card.getByRole('button', { name: 'Confirm tenancy', exact: true }).click();
      await page.getByText(new RegExp(`Tenancy added for Synthetic applicant ${width} from the Let agreed listing`)).waitFor();
      const record = await request(page, `/admin/rentals/${rid}`);
      assert.equal(record.data.tenancies.length, 1);
      const tid = record.data.tenancies[0].id, tenancy = page.locator(`#tenancy-${tid}`);
      await tenancy.getByText(`Started from Let agreed listing`).waitFor();
      await tenancy.getByText(`Signed lease, folder S-${width}`, { exact: true }).waitFor();
      const listing = await request(page, `/admin/listings/${L}`);
      assert.equal(listing.status, 200);
      assert.deepEqual([listing.data.listing.published, listing.data.listing.availability], [0, 'let_agreed'], 'the listing is untouched');

      // Entry inventory: empty, validation, explicit unit, saved, conflict.
      await tenancy.getByText('No entry inventory recorded yet.').waitFor();
      await tenancy.getByRole('button', { name: 'Record entry inventory' }).click();
      const inv = tenancy.getByRole('form', { name: 'Entry inventory' });
      await inv.getByRole('button', { name: 'Add meter reading' }).click();
      await inv.getByLabel(/^Meter/).selectOption('electricity');
      await inv.getByLabel('Reading', { exact: true }).fill('12345.6');
      await inv.getByRole('button', { name: 'Save entry inventory' }).click();
      await inv.getByText("Enter the room's name (up to 80 characters)").waitFor();
      await inv.getByText('Choose the unit: kWh, m³, ft³ or litres').waitFor();
      assert.equal(await inv.getByLabel(/^Room/).evaluate(el => el === document.activeElement), true);
      await inv.getByLabel(/^Room/).fill('Kitchen');
      await inv.getByLabel(/^Unit/).selectOption('kWh');
      await inv.getByLabel(/Evidence references/).fill(`Check-in photos, folder P-${width}`);
      await inv.getByRole('button', { name: 'Save entry inventory' }).click();
      await tenancy.getByText('Entry inventory saved.').waitFor();
      await tenancy.getByText(/^Revision 1, saved/).waitFor();
      await tenancy.getByText('Electricity 12345.6 kWh').waitFor();
      await tenancy.getByRole('button', { name: 'Edit entry inventory' }).click();
      const other = await request(page, `/admin/tenancies/${tid}/entry-inventory`, 'PUT', { expectedRevision: 1,
        rooms: [{ name: 'Hall', observations: '' }] });
      assert.equal(other.status, 200);
      await inv.getByLabel(/^Room/).fill('Kitchen and hall');
      await inv.getByRole('button', { name: 'Save entry inventory' }).click();
      await tenancy.getByText(/Someone else saved this meanwhile/).waitFor();
      await tenancy.getByRole('button', { name: 'Reload', exact: true }).click();
      await tenancy.getByText(/^Revision 2, saved/).waitFor();
      assert.equal(await inv.getByLabel(/^Room/).inputValue(), 'Kitchen and hall', 'local entries kept');
      await inv.getByRole('button', { name: 'Save entry inventory' }).click();
      await tenancy.getByText(/^Revision 3, saved/).waitFor();
      assert.ok(await fits(page), 'tenancy fits');
      await page.evaluate(() => { document.documentElement.style.zoom = '2'; });
      assert.ok(await fits(page), 'tenancy fits at 200% zoom');
      await page.evaluate(() => { document.documentElement.style.zoom = '1'; });

      if (width === 390) { // error state with retry
        let down = true;
        await page.route('**/api/admin/tenancies/*/records', route => down ? route.fulfill({ status: 503,
          contentType: 'application/json', body: JSON.stringify({ error: 'Temporarily unavailable' }) }) : route.continue());
        await page.reload();
        await page.locator(`#tenancy-${tid}`).getByRole('alert').filter({ hasText: 'Temporarily unavailable' }).waitFor();
        down = false;
        await page.locator(`#tenancy-${tid}`).getByRole('button', { name: 'Try again' }).click();
        await page.locator(`#tenancy-${tid}`).getByText(/^Revision 3, saved/).waitFor();
      }
      assert.equal((await request(page, `/admin/rentals/${rid}`)).data.tenancies.length, 1, 'one tenancy');
      assert.deepEqual(errors, []);
      await context.close();
      console.log(`ADM-06: ${width}px tenancy origin, signed contract and entry inventory passed`);
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
