// PRE-12, local synthetic fixture only (run through test:e2e:isolated with PRE12_TENANCY_LINK_READY=1 from run-e2e.cjs):
// a tenancy's tenant linked to a contact by a click on the rental, seen and taken back from a privacy request, and the
// copy with the linked tenancy, at 1280 and 390 px.
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PW || 'playwright-core');
const { readFileSync } = require('node:fs');
const { parseEnv } = require('node:util');
const { randomUUID } = require('node:crypto');
const BASE = process.env.BASE;
const request = (page, path, method = 'GET', body) => page.evaluate(async ({ path, method, body }) => {
  const response = await fetch('/api' + path, { method, credentials: 'same-origin',
    headers: body ? { 'Content-Type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined });
  return { status: response.status, data: await response.json() };
}, { path, method, body });
const fits = page => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1);

(async () => {
  assert.ok(BASE && process.env.E2E_VARS, 'isolated fixture required');
  const vars = parseEnv(readFileSync(process.env.E2E_VARS, 'utf8'));
  assert.equal(vars.PRE12_TENANCY_LINK_READY, '1');
  const { signSession, COOKIE } = await import('../server/auth.js');
  const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
  try {
    for (const width of [1280, 390]) {
      const context = await browser.newContext({ viewport: { width, height: 900 }, timezoneId: 'Europe/Jersey', reducedMotion: 'reduce' });
      await context.addCookies([{ name: COOKIE, value: await signSession('admin@example.test', vars.SESSION_SECRET),
        domain: new URL(BASE).hostname, path: '/', httpOnly: true, secure: true, sameSite: 'Strict' }]);
      await context.route('https://fonts.googleapis.com/**', r => r.fulfill({ status: 200, contentType: 'text/css', body: '/* offline fixture */' }));
      const page = await context.newPage(), errors = [];
      page.on('pageerror', error => errors.push(error.message));
      page.setDefaultTimeout(9000);
      await page.goto(new URL('admin/#/rentals', BASE).href);
      await page.getByRole('heading', { name: 'Rentals', exact: true }).waitFor();
      const stamp = `${width}-${Date.now()}`, name = `PRE12 Tenant ${stamp}`, email = `pre12-tenant-${stamp}@example.test`;
      const made = await request(page, '/admin/applicants', 'POST', { name, email, phone: `+447700${String(width + 1).padStart(6, '0')}`,
        source: 'phone', operation: 'rent', budget_max: 2000 });
      assert.ok(made.status < 300, JSON.stringify(made.data));
      const contactId = (await request(page, `/admin/applicants/${made.data.id}`)).data.contact.id;
      const owner = await request(page, '/admin/landlords', 'POST', { name: `Synthetic PRE12 owner ${width}` });
      const address = `Synthetic linked flat ${stamp}`;
      const property = await request(page, '/admin/rentals', 'POST', { landlord_id: owner.data.landlord.id, address,
        parish: 'St Helier', service: 'let_only' });
      assert.equal(property.status, 201, JSON.stringify(property.data));
      const rid = property.data.rental.id;
      const tenancy = await request(page, `/admin/rentals/${rid}/tenancies`, 'POST', { tenant_name: name, tenant_email: email.toUpperCase(),
        kind: 'periodic', regime: '2025', rent: 1200, start_on: '2026-11-01' });
      assert.equal(tenancy.status, 201, JSON.stringify(tenancy.data));
      const tid = tenancy.data.tenancy.id;

      // On the rental: the contact with the same email is only proposed; one click links it.
      await page.goto(new URL(`admin/#/rentals/${rid}`, BASE).href);
      const card = page.locator(`#tenancy-${tid}`);
      await card.getByRole('heading', { name: 'Contact', exact: true }).waitFor();
      await card.getByText('same email', { exact: true }).waitFor();
      assert.equal(await card.getByText('Linked', { exact: true }).count(), 0);
      await card.getByRole('button', { name: `Link as tenant ${name}` }).click();
      await card.getByRole('status').filter({ hasText: `${name} linked as the tenant.` }).waitFor();
      await card.getByText('Linked', { exact: true }).waitFor();
      await card.getByRole('button', { name: `Remove link to ${name}` }).waitFor();
      if (width === 390) assert.ok(await fits(page), 'no sideways scroll at 390 on the rental');

      // From an access request: the linked tenancy is listed, enters the copy, and can be taken back.
      const id = randomUUID();
      const r = await request(page, '/admin/privacy-requests', 'POST', { id, kind: 'access', received_on: '2026-11-12',
        received_via: 'email', reference: `Email ${stamp}` });
      assert.equal(r.status, 201, JSON.stringify(r.data));
      const linked = await request(page, `/admin/privacy-requests/${id}/contact`, 'POST', { revision: 1, contact_id: contactId });
      const checked = await request(page, `/admin/privacy-requests/${id}/identity`, 'POST', { revision: linked.data.request.revision,
        method: 'photo_id', reference: 'Passport seen' });
      assert.equal(checked.status, 200, JSON.stringify(checked.data));
      await page.goto(new URL(`admin/#/privacy/${id}`, BASE).href);
      await page.getByRole('heading', { name: 'Access request', level: 1 }).waitFor({ timeout: 10000 });
      const box = title => page.locator('.card').filter({ has: page.getByRole('heading', { name: title, exact: true }) });
      const review = box('Tenancies to check');
      await review.getByText(address).waitFor();
      await review.getByText('Linked', { exact: true }).waitFor();
      const copy = box('Copy for the person');
      await copy.getByRole('button', { name: 'Show copy', exact: true }).click();
      const text = await copy.getByLabel('Copy to review').textContent();
      assert.match(text, /"tenancies"/);
      assert.ok(text.includes(address));
      assert.doesNotMatch(text, /"(rent|deposit|occupants|notes)":/);
      await review.getByRole('button', { name: new RegExp(`^Remove link: tenancy at ${address}`) }).click();
      await page.getByRole('status').filter({ hasText: 'Tenancy link saved.' }).waitFor();
      await review.getByRole('button', { name: new RegExp(`^Link as tenant: tenancy at ${address}`) }).waitFor();
      await copy.getByRole('button', { name: 'Show copy', exact: true }).click();
      assert.equal((await copy.getByLabel('Copy to review').textContent()).includes(address), false);
      if (width === 390) assert.ok(await fits(page), 'no sideways scroll at 390 on the request');
      assert.deepEqual(errors, []);
      await context.close();
    }
  } finally { await browser.close(); }
  console.log('PRE-12 tenancy link isolated UI OK: proposed by email, linked by a click, listed in the request, in the copy, taken back, 1280/390.');
})().catch(e => { console.error(e.message); process.exitCode = 1; });
