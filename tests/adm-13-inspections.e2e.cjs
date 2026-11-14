// ADM-13, local synthetic fixture only (run through test:e2e:isolated with ADM13_INSPECTIONS_READY=1 from run-e2e.cjs): the
// overdue inspection in Rentals › To do, the mobile checklist by room, a conflict that keeps the entries, and a found repair
// confirmed into Repairs, at 1280 and 390 px.
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PW || 'playwright-core');
const { readFileSync } = require('node:fs');
const { parseEnv } = require('node:util');
const { join } = require('node:path');
const BASE = process.env.BASE;
const request = (page, path, method = 'GET', body) => page.evaluate(async ({ path, method, body }) => {
  const response = await fetch('/api' + path, { method, credentials: 'same-origin',
    headers: body ? { 'Content-Type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined });
  return { status: response.status, data: await response.json() };
}, { path, method, body });
const fits = page => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1);
const tall = async locator => Math.min(...(await locator.evaluateAll(els => els.map(el => el.getBoundingClientRect().height))));

(async () => {
  assert.ok(BASE && process.env.E2E_PERSIST && process.env.E2E_VARS, 'isolated fixture required');
  const vars = parseEnv(readFileSync(process.env.E2E_VARS, 'utf8'));
  assert.equal(vars.ADM13_INSPECTIONS_READY, '1');
  const { signSession, COOKIE } = await import('../server/auth.js');
  const { addMonths } = await import('../server/rentals.js');
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
      const owner = await request(page, '/admin/landlords', 'POST', { name: `Synthetic ADM13 owner ${width}` });
      const address = `Synthetic inspected flat ${width}`;
      const property = await request(page, '/admin/rentals', 'POST', { landlord_id: owner.data.landlord.id, address, parish: 'St Helier',
        service: 'let_only' });
      assert.equal(property.status, 201);
      const rid = property.data.rental.id;
      const tenancy = await request(page, `/admin/rentals/${rid}/tenancies`, 'POST', { tenant_name: `Synthetic tenant ${width}`, kind: 'periodic',
        regime: '2025', rent: 1200, deposit: 1200, start_on: addMonths(today, -7) });
      assert.equal(tenancy.status, 201, JSON.stringify(tenancy.data));
      const tid = tenancy.data.tenancy.id;
      assert.equal((await request(page, `/admin/tenancies/${tid}/entry-inventory`, 'PUT', { expectedRevision: 0,
        rooms: [{ name: 'Kitchen', observations: '' }, { name: 'Bedroom 1', observations: '' }] })).status, 200);

      // The overdue inspection is in To do with the other checks and deadlines.
      await page.reload();
      const todo = page.locator('section[aria-labelledby="h-checks"] tr', { hasText: address }).filter({ hasText: 'Inspection' });
      await todo.getByText('Overdue').waitFor();

      await page.goto(new URL(`admin/#/rentals/${rid}`, BASE).href);
      const card = page.locator(`#tenancy-${tid}`), box = card.locator(`section[aria-labelledby="h-in${tid}"]`);
      await box.getByText('Next inspection due').waitFor();
      await box.getByText('Overdue').waitFor();
      await box.getByText('Six months after the start of the tenancy').waitFor();
      await box.getByText('No inspections recorded yet.').waitFor();

      // The checklist starts from the entry inventory's rooms; every room needs a state, and attention says what.
      await box.getByRole('button', { name: 'Record inspection' }).click();
      const form = box.getByRole('form', { name: 'Record inspection' });
      assert.deepEqual(await form.getByLabel('Room', { exact: true }).evaluateAll(els => els.map(el => el.value)), ['Kitchen', 'Bedroom 1']);
      assert.equal(await form.getByLabel('Inspected on').inputValue(), today);
      await form.getByRole('button', { name: 'Save inspection' }).click();
      await form.getByText('Choose OK, Needs attention or Not checked').first().waitFor();
      assert.equal(await form.getByRole('group', { name: 'State of Kitchen' }).getByLabel('OK').evaluate(el => el === document.activeElement),
        true, 'focus on the first error');
      await form.getByRole('group', { name: 'State of Kitchen' }).getByLabel('Needs attention').check();
      await form.getByRole('group', { name: 'State of Bedroom 1' }).getByLabel('Not checked').check();
      await form.getByRole('button', { name: 'Save inspection' }).click();
      await form.getByText('Say what needs attention').waitFor();
      await form.getByLabel('What needs attention').fill('Tap dripping under the sink.');
      await form.getByLabel('Needs a repair').check();
      await form.getByLabel(/Evidence references/).fill(`Inspection photos, folder I-${width}`);
      if (width === 390) {
        for (const [what, locator] of [['state choices', form.locator('.choices .check')], ['buttons', box.locator('.btn')],
          ['fields', form.locator('input:not([type]), input[type=date]')]])
          assert.ok(await tall(locator) >= 44, `${what} reach 44px on a phone`);
      }
      assert.ok(await fits(page), 'checklist fits');
      if (process.env.E2E_SHOTS) await form.screenshot({ path: join(process.env.E2E_SHOTS, `adm13-checklist-${width}.png`) }).catch(() => {});
      await form.getByRole('button', { name: 'Save inspection' }).click();
      await box.getByText('Inspection recorded.').waitFor();
      const list = box.getByRole('list', { name: 'Inspections recorded' });
      await list.getByText('2 rooms, 1 needing attention, 1 not checked').waitFor();
      await list.getByText('Repair to confirm').waitFor();
      await list.getByText(`Inspection photos, folder I-${width}`).waitFor();
      await box.getByText(/^Six months after the last one/).waitFor();
      assert.equal(await box.getByText('Overdue').count(), 0);

      // Conflict: another inspection lands first; the entries stay and save after a reload. A state is chosen by keyboard.
      await box.getByRole('button', { name: 'Record inspection' }).click();
      assert.equal((await request(page, `/admin/tenancies/${tid}/inspections`, 'POST', { expectedRevision: 1, operation_id: `e2e-other-${width}`,
        inspected_on: today, rooms: [{ name: 'Hall', condition: 'ok', observations: '' }] })).status, 201);
      await form.getByRole('group', { name: 'State of Kitchen' }).getByLabel('OK').focus();
      await page.keyboard.press('Space');
      assert.equal(await form.getByRole('group', { name: 'State of Kitchen' }).getByLabel('OK').isChecked(), true);
      await form.getByRole('group', { name: 'State of Bedroom 1' }).getByLabel('OK').check();
      await form.getByRole('button', { name: 'Save inspection' }).click();
      await form.getByText(/Someone else recorded an inspection meanwhile/).waitFor();
      await form.getByRole('button', { name: 'Reload', exact: true }).click();
      await form.getByText(/The inspections saved meanwhile are listed below/).waitFor();
      await list.getByText('1 room').waitFor();
      assert.equal(await form.getByRole('group', { name: 'State of Bedroom 1' }).getByLabel('OK').isChecked(), true, 'local entries kept');
      await form.getByRole('button', { name: 'Save inspection' }).click();
      await box.getByText('Inspection recorded.').waitFor();
      await list.locator(':scope > li').nth(2).waitFor();
      assert.equal(await list.locator(':scope > li').count(), 3);

      // The found repair waits for a person: confirmed, it is reported in Repairs at the urgency chosen.
      assert.equal(await page.locator('#repairs').count(), 0, 'no repair before the decision');
      const decision = box.getByRole('group', { name: 'Repair found in Kitchen' });
      await decision.getByLabel('Urgency').selectOption('urgent');
      await decision.getByRole('button', { name: 'Create repair for Kitchen' }).click();
      await box.getByText('Repair created in Repairs: Kitchen.').waitFor();
      const repair = page.locator('#repairs li', { hasText: 'Kitchen: Tap dripping under the sink.' });
      await repair.getByText('Urgent', { exact: true }).waitFor();
      await repair.getByText('Reported', { exact: true }).waitFor();
      await list.getByText(/^Repair created by admin@example\.test/).waitFor();
      assert.equal(await box.getByText('Repair to confirm').count(), 0);
      assert.ok(await fits(page), 'inspections fit');
      if (process.env.E2E_SHOTS) await box.screenshot({ path: join(process.env.E2E_SHOTS, `adm13-inspections-${width}.png`) }).catch(() => {});
      await page.evaluate(() => { document.documentElement.style.zoom = '2'; });
      assert.ok(await fits(page), 'fits at 200% zoom');
      await page.evaluate(() => { document.documentElement.style.zoom = '1'; });

      // History lines, and the to-do no longer lists the inspection.
      await page.reload();
      await box.getByText(/^Six months after the last one/).waitFor();
      await page.locator('details', { has: page.locator('#h-history') }).locator('summary').click();
      await page.getByText(/^Inspection of .* recorded: 2 rooms, 1 needing attention, 1 not checked; 1 repair to confirm$/).waitFor();
      await page.getByText('Repair reported from an inspection: Kitchen: Tap dripping under the sink.').waitFor();
      await page.goto(new URL('admin/#/rentals', BASE).href);
      await page.getByRole('heading', { name: 'To do' }).waitFor();
      assert.equal(await page.locator('section[aria-labelledby="h-checks"] tr', { hasText: address }).filter({ hasText: 'Inspection' }).count(), 0);

      if (width === 390) { // error state with retry
        let down = true;
        await page.route('**/api/admin/tenancies/*/inspections', route => down ? route.fulfill({ status: 503,
          contentType: 'application/json', body: JSON.stringify({ error: 'Temporarily unavailable' }) }) : route.continue());
        await page.goto(new URL(`admin/#/rentals/${rid}`, BASE).href);
        const alert = box.getByRole('alert').filter({ hasText: 'Temporarily unavailable' });
        await alert.waitFor();
        down = false;
        await alert.getByRole('button', { name: 'Try again' }).click();
        await box.getByText(/^Six months after the last one/).waitFor();
      }
      assert.deepEqual(errors, []);
      await context.close();
      console.log(`ADM-13: ${width}px to-do, checklist, conflict and repair decision passed`);
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
