// ADM-16, local synthetic fixture only (run through test:e2e:isolated with ADM16_TENANCY_EXIT_READY=1 from run-e2e.cjs):
// the exit inventory compared with the entry inventory, the proposed deductions and a step with mydeposits, at 1280 and 390 px.
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
  assert.equal(vars.ADM16_TENANCY_EXIT_READY, '1');
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
      const owner = await request(page, '/admin/landlords', 'POST', { name: `Synthetic ADM16 owner ${width}` });
      const property = await request(page, '/admin/rentals', 'POST', { landlord_id: owner.data.landlord.id,
        address: `Synthetic exit flat ${width}`, parish: 'St Helier', service: 'let_only' });
      assert.equal(property.status, 201);
      const rid = property.data.rental.id, start = plusDays(today, -120);
      const tenancy = await request(page, `/admin/rentals/${rid}/tenancies`, 'POST', { tenant_name: `Synthetic tenant ${width}`, kind: 'periodic',
        regime: '2025', rent: 1200, deposit: 1200, start_on: start });
      assert.equal(tenancy.status, 201, JSON.stringify(tenancy.data));
      const tid = tenancy.data.tenancy.id;
      assert.equal((await request(page, `/admin/tenancies/${tid}/entry-inventory`, 'PUT', { expectedRevision: 0,
        rooms: [{ name: 'Kitchen', observations: 'Worktop chipped by the sink.' }, { name: 'Bedroom 1', observations: '' }],
        meter_readings: [{ meter: 'electricity', reading: '12345.6', unit: 'kWh' }], evidence_refs: [`Check-in photos, folder E-${width}`] })).status, 200);
      const planned = plusDays(today, 14);
      assert.equal((await request(page, `/admin/tenancies/${tid}/end`, 'POST', { ended_on: planned })).status, 200);
      await page.goto(new URL(`admin/#/rentals/${rid}`, BASE).href);
      const card = page.locator(`#tenancy-${tid}`), exit = card.locator(`section[aria-labelledby="h-xi${tid}"]`);

      // Planned is not done; the form starts from the entry inventory's rooms and checks each comparison.
      await exit.getByText('A planned date is not a move-out').waitFor();
      await exit.getByText('No exit inventory recorded yet.').waitFor();
      await exit.getByRole('button', { name: 'Record exit inventory' }).click();
      const inv = card.getByRole('form', { name: 'Exit inventory' });
      assert.deepEqual(await inv.getByLabel('Room', { exact: true }).evaluateAll(els => els.map(el => el.value)), ['Kitchen', 'Bedroom 1']);
      await inv.getByText('At check-in: Worktop chipped by the sink.').waitFor();
      await inv.getByRole('button', { name: 'Save exit inventory' }).click();
      await inv.getByText('Choose how the room compares with check-in').first().waitFor();
      assert.equal(await inv.getByLabel(/^Compared with check-in/).first().evaluate(el => el === document.activeElement), true, 'focus on the first error');
      await inv.getByLabel(/^Compared with check-in/).nth(0).selectOption('as_entry');
      await inv.getByLabel(/^Compared with check-in/).nth(1).selectOption('changed');
      await inv.getByLabel(/^Reading/).fill('13001');
      await inv.getByRole('button', { name: 'Save exit inventory' }).click();
      await inv.getByText('Say what changed').waitFor();
      await inv.getByText('Enter the date of the reading').waitFor();
      await inv.getByLabel(/^Observations: what changed/).fill('Carpet stained by the window.');
      await inv.getByLabel(/^Read on/).fill(today);
      await inv.getByLabel('Keys back on (optional)').fill(today);
      await inv.getByLabel(/Evidence references/).fill(`Check-out photos, folder X-${width}`);
      await inv.getByRole('button', { name: 'Save exit inventory' }).click();
      await exit.getByText('Exit inventory saved.').waitFor();
      await exit.getByText(/^Revision 1, saved .*Compared with entry inventory revision 1\./).waitFor();
      await exit.getByText('The tenant has moved out').waitFor();
      await exit.getByText('Carpet stained by the window.').waitFor();
      await exit.getByText(/Electricity 13001 kWh, read .*\(check-in 12345\.6 kWh\)/).waitFor();
      assert.ok(await fits(page), 'exit inventory fits');

      // Conflict: another save lands first; the typed entries stay.
      await exit.getByRole('button', { name: 'Edit exit inventory' }).click();
      const current = (await request(page, `/admin/tenancies/${tid}/exit`)).data.exit;
      assert.equal((await request(page, `/admin/tenancies/${tid}/exit-inventory`, 'PUT', { expectedRevision: 1, entry_inventory_revision: 1,
        moved_out_on: today, rooms: current.rooms, meter_readings: current.meter_readings,
        evidence_refs: current.evidence_refs.map(r => r.evidence_ref) })).status, 200);
      await inv.getByLabel('Room', { exact: true }).nth(0).fill('Kitchen and hall');
      await inv.getByLabel(/^Compared with check-in/).nth(0).selectOption('not_checked');
      await inv.getByRole('button', { name: 'Save exit inventory' }).click();
      await exit.getByText(/Someone else saved this meanwhile/).waitFor();
      await exit.getByRole('button', { name: 'Reload', exact: true }).click();
      await exit.getByText(/^Revision 2, saved/).waitFor();
      assert.equal(await inv.getByLabel('Room', { exact: true }).nth(0).inputValue(), 'Kitchen and hall', 'local entries kept');
      await inv.getByRole('button', { name: 'Save exit inventory' }).click();
      await exit.getByText(/^Revision 3, saved/).waitFor();
      await exit.getByText('In the entry inventory but not in this one: Kitchen.').waitFor();

      // Deposit: whole pence, never over the deposit, a proposal is not an agreement.
      const deposit = card.locator(`section[aria-labelledby="h-dp${tid}"]`);
      await deposit.getByText('£1,200.00', { exact: true }).waitFor();
      await deposit.getByText('No deductions proposed yet.').waitFor();
      await deposit.getByRole('button', { name: 'Propose deductions' }).click();
      const prop = deposit.getByRole('form', { name: 'Proposed deductions' });
      await prop.getByText('No deductions: the whole deposit would go back to the tenant.').waitFor();
      await prop.getByRole('button', { name: 'Add deduction' }).click();
      await prop.getByLabel('For', { exact: true }).fill('Carpet clean');
      await prop.getByLabel('Amount (£)').fill('1,300');
      await prop.getByLabel('Evidence (optional)').selectOption(`Check-out photos, folder X-${width}`);
      await prop.getByRole('button', { name: 'Save proposed deductions' }).click();
      await prop.getByText('The deductions add up to £1,300.00, more than the £1,200.00 deposit').waitFor();
      await prop.getByLabel('Amount (£)').fill('120.50');
      await prop.getByText('£120.50', { exact: true }).waitFor();
      await prop.getByRole('button', { name: 'Save proposed deductions' }).click();
      await deposit.getByText('Deductions proposed: not agreed, not requested in mydeposits and not returned.').waitFor();
      await deposit.getByText(/if agreed, £1,079\.50 would go back to the tenant/).waitFor();

      // A step with mydeposits needs its confirmation's reference; once recorded, the record is held.
      const step = deposit.getByRole('form', { name: 'Record a deposit step' });
      await step.getByLabel(/^What happened/).selectOption('requested');
      await step.getByRole('button', { name: 'Record step' }).click();
      await step.getByText(/Enter where the confirmation is kept/).waitFor();
      assert.equal(await step.getByLabel('Where the confirmation is kept').evaluate(el => el === document.activeElement), true);
      await step.getByLabel('Where the confirmation is kept').fill(`Repayment request, mydeposits R-${width}`);
      await step.getByRole('button', { name: 'Record step' }).click();
      await deposit.getByRole('list', { name: 'Deposit steps with mydeposits' }).getByText('Repayment requested in mydeposits').waitFor();
      await deposit.getByRole('note').filter({ hasText: /^Repayment requested in mydeposits on / }).waitFor();
      await exit.getByText('Kept as recorded: the deposit\'s progress with mydeposits rests on it.').waitFor();
      assert.equal(await exit.getByRole('button', { name: 'Edit exit inventory' }).count(), 0);
      assert.equal(await deposit.getByRole('button', { name: 'Edit proposed deductions' }).count(), 0);
      assert.ok(await fits(page), 'deposit fits');
      await page.evaluate(() => { document.documentElement.style.zoom = '2'; });
      assert.ok(await fits(page), 'fits at 200% zoom');
      await page.evaluate(() => { document.documentElement.style.zoom = '1'; });

      // History lines (the page's own data, read again), and no money moved.
      await page.reload();
      await card.getByText(/^Revision 3, saved/).waitFor();
      await page.locator('details', { has: page.locator('#h-history') }).locator('summary').click();
      await page.getByText(/^Exit inventory saved \(revision 1\): 2 rooms, 1 changed, compared with entry inventory revision 1; keys back/).waitFor();
      await page.getByText('Deposit deductions proposed: £120.50 of £1,200.00 (1 line)').waitFor();
      await page.getByText(/^Deposit: repayment requested in mydeposits on /).waitFor();
      const detail = await request(page, `/admin/tenancies/${tid}`);
      assert.deepEqual([detail.data.payments.length, detail.data.tenancy.ended_on], [0, planned], 'no payment; the planned move-out unchanged');

      if (width === 390) { // error state with retry
        let down = true;
        await page.route('**/api/admin/tenancies/*/exit', route => down ? route.fulfill({ status: 503,
          contentType: 'application/json', body: JSON.stringify({ error: 'Temporarily unavailable' }) }) : route.continue());
        await page.reload();
        await page.locator(`#tenancy-${tid}`).getByRole('alert').filter({ hasText: 'Temporarily unavailable' }).waitFor();
        down = false;
        await page.locator(`#tenancy-${tid}`).getByRole('alert').filter({ hasText: 'Temporarily unavailable' })
          .getByRole('button', { name: 'Try again' }).click();
        await page.locator(`#tenancy-${tid}`).getByText(/^Revision 3, saved/).waitFor();
      }
      assert.deepEqual(errors, []);
      await context.close();
      console.log(`ADM-16: ${width}px exit inventory, proposed deductions and deposit step passed`);
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
