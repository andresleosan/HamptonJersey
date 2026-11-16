// ADM-19, local synthetic fixture only (run through test:e2e:isolated with ADM19_SIGNATURE_READY=1 from run-e2e.cjs):
// the agreement's signatures checked outside Hampton, recorded in the tenancy card with what is still missing, a
// conflict that keeps the typed entries, the history line, at 1280 and 390 px.
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
const fits = page => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1);
const plusDays = (date, n) => new Date(Date.parse(date + 'T12:00:00Z') + n * 864e5).toISOString().slice(0, 10);

(async () => {
  assert.ok(BASE && process.env.E2E_PERSIST && process.env.E2E_VARS, 'isolated fixture required');
  const vars = parseEnv(readFileSync(process.env.E2E_VARS, 'utf8'));
  assert.equal(vars.ADM19_SIGNATURE_READY, '1');
  const { signSession, COOKIE } = await import('../server/auth.js');
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Jersey', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const browser = await chromium.launch({ executablePath: process.env.CHROME });
  try {
    for (const width of [1280, 390]) {
      const context = await browser.newContext({ viewport: { width, height: 900 }, timezoneId: 'Europe/Jersey', reducedMotion: 'reduce' });
      await context.addCookies([{ name: COOKIE, value: await signSession('admin@example.test', vars.SESSION_SECRET),
        domain: new URL(BASE).hostname, path: '/', httpOnly: true, secure: true, sameSite: 'Strict' }]);
      const page = await context.newPage(), errors = [];
      page.on('pageerror', error => errors.push(error.message));
      page.setDefaultTimeout(9000);
      await page.goto(new URL('admin/#/rentals', BASE).href);
      await page.getByRole('heading', { name: 'Rentals', exact: true }).waitFor();
      const owner = await request(page, '/admin/landlords', 'POST', { name: `Synthetic ADM19 owner ${width}` });
      const property = await request(page, '/admin/rentals', 'POST', { landlord_id: owner.data.landlord.id,
        address: `Synthetic signed flat ${width}`, parish: 'St Helier', service: 'let_only' });
      assert.equal(property.status, 201);
      const rid = property.data.rental.id;
      const tenancy = await request(page, `/admin/rentals/${rid}/tenancies`, 'POST', { tenant_name: `Synthetic tenant ${width}`, kind: 'periodic',
        regime: '2025', rent: 1200, start_on: plusDays(today, -10) });
      assert.equal(tenancy.status, 201, JSON.stringify(tenancy.data));
      const tid = tenancy.data.tenancy.id;
      await page.goto(new URL(`admin/#/rentals/${rid}`, BASE).href);
      const card = page.locator(`#tenancy-${tid}`), sig = card.locator(`section[aria-labelledby="h-sg${tid}"]`);

      // Nothing recorded: what is missing is said.
      await sig.getByText(/^Not recorded\. The agreement is signed outside Hampton/).waitFor();
      await sig.getByText(/Still to check: Landlord, Tenant\./).waitFor();

      // Two tenants sign; a signature without its day is refused, with focus on it.
      await sig.getByRole('button', { name: 'Record signatures' }).click();
      const form = sig.getByRole('form', { name: 'Signatures' });
      await form.getByLabel('Tenants who sign').fill('2');
      const party = name => form.getByRole('group', { name, exact: true });
      await party('Tenant 2').waitFor();
      await party('Landlord').getByLabel('Signed on').fill(plusDays(today, -2));
      await party('Landlord').getByLabel('Where it is recorded').fill(`Signing service, envelope SYN-${width}`);
      await party('Tenant 1').getByLabel('Where it is recorded').fill(`Signing service, envelope SYN-${width}`);
      await form.getByRole('button', { name: 'Save signatures' }).click();
      await form.getByText('Enter the day it was signed: today or earlier').waitFor();
      assert.equal(await party('Tenant 1').getByLabel('Signed on').evaluate(el => el === document.activeElement), true, 'focus on the first error');
      await party('Tenant 1').getByLabel('Signed on').fill(plusDays(today, -1));
      await form.getByRole('button', { name: 'Save signatures' }).click();
      await sig.getByText('Signatures recorded.').waitFor();
      await sig.getByText('Still to sign or to check: Tenant 2.').waitFor();
      const list = sig.getByRole('list', { name: 'Signatures checked' });
      assert.equal(await list.getByRole('listitem').count(), 2);
      await list.getByText(/Checked by admin@example\.test on/).first().waitFor();
      assert.ok(await fits(page), 'signatures fit');

      // Conflict: another save lands first; the typed entries stay, then save again against it.
      await sig.getByRole('button', { name: 'Update signatures' }).click();
      const current = (await request(page, `/admin/tenancies/${tid}/signatures`)).data;
      assert.equal((await request(page, `/admin/tenancies/${tid}/signatures`, 'PUT', { expectedRevision: current.revision,
        contract_revision: current.contract_revision, tenants: 2, signatures: current.signatures.map(s => ({ party: s.party,
          signed_on: s.signed_on, evidence_ref: s.evidence_ref })) })).status, 200);
      await party('Tenant 2').getByLabel('Signed on').fill(today);
      await party('Tenant 2').getByLabel('Where it is recorded').fill(`Paper copy, office file F-${width}`);
      await form.getByRole('button', { name: 'Save signatures' }).click();
      await sig.getByText(/Someone else saved this meanwhile/).waitFor();
      await sig.getByRole('button', { name: 'Reload', exact: true }).click();
      await sig.getByText(/your entries are still in the form/).waitFor();
      assert.equal(await party('Tenant 2').getByLabel('Where it is recorded').inputValue(), `Paper copy, office file F-${width}`, 'local entries kept');
      await form.getByRole('button', { name: 'Save signatures' }).click();
      await sig.getByText(/^Signed externally, reviewed by admin@example\.test on /).waitFor();
      assert.equal(await list.getByRole('listitem').count(), 3);
      await list.getByText(`Paper copy, office file F-${width}`).waitFor();
      assert.ok(await fits(page), 'complete signatures fit');
      await page.evaluate(() => { document.documentElement.style.zoom = '2'; });
      // At 200% nothing in the signatures section is wider than its box (the rest of the page has its own checks).
      assert.deepEqual(await sig.evaluate(s => [s, ...s.querySelectorAll('*')].filter(el => el.clientWidth > 0 && el.scrollWidth > el.clientWidth + 1)
        .map(el => `${el.tagName}.${el.className}`)), [], 'signatures fit at 200% zoom');
      await page.evaluate(() => { document.documentElement.style.zoom = '1'; });

      // ADM-20's carry-over: the last signature's day is proposed as the agreement date, and recorded only when accepted.
      const proposal = sig.getByRole('group', { name: 'Proposed agreement date' });
      await proposal.getByText(/^The last party signed on .*; the agreement date is not recorded\./).waitFor();
      assert.equal((await request(page, `/admin/tenancies/${tid}`)).data.tenancy.agreement_on, null, 'a proposal is not recorded');
      await proposal.getByRole('button', { name: /^Use .* as the agreement date$/ }).click();
      await proposal.waitFor({ state: 'detached' });
      await card.getByText(/^Agreed /).waitFor();
      assert.equal((await request(page, `/admin/tenancies/${tid}`)).data.tenancy.agreement_on, today, 'accepted: the last signature\'s day');

      // History: counts only, never the references.
      await page.reload();
      await card.getByText(/^Signed externally, reviewed by/).waitFor();
      await page.locator('details', { has: page.locator('#h-history') }).locator('summary').click();
      await page.getByText('Signatures checked outside Hampton recorded (revision 1): 2 of 3 signed').waitFor();
      await page.getByText('Signatures checked outside Hampton recorded (revision 3): 3 of 3 signed').waitFor();
      const history = page.locator('details', { has: page.locator('#h-history') });
      assert.equal(await history.getByText(/SYN-|office file/).count(), 0, 'no reference in the history');
      const detail = await request(page, `/admin/tenancies/${tid}`);
      assert.deepEqual([detail.data.payments.length, detail.data.tenancy.ended_on], [0, null], 'the tenancy unchanged');

      if (width === 390) { // error state with retry
        let down = true;
        await page.route('**/api/admin/tenancies/*/signatures', route => down ? route.fulfill({ status: 503,
          contentType: 'application/json', body: JSON.stringify({ error: 'Temporarily unavailable' }) }) : route.continue());
        await page.reload();
        await page.locator(`#tenancy-${tid}`).getByRole('alert').filter({ hasText: 'Temporarily unavailable' }).waitFor();
        down = false;
        await page.locator(`#tenancy-${tid}`).getByRole('alert').filter({ hasText: 'Temporarily unavailable' })
          .getByRole('button', { name: 'Try again' }).click();
        await page.locator(`#tenancy-${tid}`).getByText(/^Signed externally, reviewed by/).waitFor();
      }
      assert.deepEqual(errors, []);
      await context.close();
      console.log(`ADM-19: ${width}px signatures checked outside Hampton passed`);
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
