// ADM-11, local synthetic fixture only (run through test:e2e:isolated with ADM11_CALENDAR_READY=1 and
// ADM17_LEGAL_TERMS_READY=1 from run-e2e.cjs): the rest of the property calendar (hazards, electrical checklist, copies
// to the tenant, licence changes, the deposit's prescribed information) on Rentals and on the property page, recorded
// through the Update dialog, with the estimated label and its periods under Legal terms. At 1280 and 390 px.
// The Inbox notices come from the clock's pass, which this fixture does not run: tests/server/adm-11-calendar.test.mjs.
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PW || 'playwright-core');
const { readFileSync } = require('node:fs');
const { parseEnv } = require('node:util');
const BASE = process.env.BASE;
const LABEL = 'Estimated · not validated by a lawyer';
const NEW = ['hazards', 'checklist', 'licence_copy', 'eicr_copy', 'licence_change', 'deposit_info'];
const request = (page, path) => page.evaluate(async path => {
  const response = await fetch('/api' + path, { credentials: 'same-origin' });
  return { status: response.status, data: await response.json() };
}, path);
const fits = page => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1);

(async () => {
  assert.ok(BASE && process.env.E2E_PERSIST && process.env.E2E_VARS, 'isolated fixture required');
  const vars = parseEnv(readFileSync(process.env.E2E_VARS, 'utf8'));
  assert.deepEqual([vars.ADM11_CALENDAR_READY, vars.ADM17_LEGAL_TERMS_READY], ['1', '1']);
  const { signSession, COOKIE } = await import('../server/auth.js');
  const { plusDays } = await import('../server/viewings.js');
  const { addMonths } = await import('../server/rentals.js');
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Jersey', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  // The panel's fmtDay (admin/src/format.js): "Mon 14 Dec", with the year when it is not this one.
  const fmtDay = d => new Date(`${d}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC',
    ...(d.slice(0, 4) !== today.slice(0, 4) ? { year: 'numeric' } : {}) }).replace(',', '');
  const browser = await chromium.launch({ executablePath: process.env.CHROME });
  try {
    // 1280 records the hazards check and reports a licence change; 390 closes the change, records the one-offs and
    // renews the licence.
    for (const width of [1280, 390]) {
      const context = await browser.newContext({ viewport: { width, height: 900 }, timezoneId: 'Europe/Jersey', reducedMotion: 'reduce' });
      await context.addCookies([{ name: COOKIE, value: await signSession('admin@example.test', vars.SESSION_SECRET),
        domain: new URL(BASE).hostname, path: '/', httpOnly: true, secure: true, sameSite: 'Strict' }]);
      const page = await context.newPage(), errors = [];
      page.on('pageerror', error => errors.push(error.message));
      page.setDefaultTimeout(9000);
      const go = async hash => { await page.goto(new URL(`admin/#/${hash}`, BASE).href); };
      // The to-do of the seeded full-management property (1), from the API the screen reads.
      const todo = async () => (await request(page, '/admin/rentals')).data.todo.compliance.filter(c => c.rental_id === 1 && NEW.includes(c.kind))
        .map(c => [c.kind, c.status]).sort();
      const block = page.locator('section[aria-labelledby="h-checks"]');
      const row = kind => page.locator(`#check-${kind}`);
      // Opens a check's dialog; save() waits for the property page to have reloaded with what `shows`.
      const update = async label => {
        await page.getByRole('button', { name: `Update ${label}`, exact: true }).click();
        const dialog = page.getByRole('dialog');
        await dialog.getByRole('button', { name: 'Save check', exact: true }).waitFor();
        assert.ok(await fits(page), `the ${label} dialog fits at ${width}`);
        return dialog;
      };
      const save = async (dialog, kind, shows) => {
        await dialog.getByRole('button', { name: 'Save check', exact: true }).click();
        await dialog.waitFor({ state: 'hidden' });
        for (const text of shows) await row(kind).getByText(text, { exact: false }).waitFor();
      };

      // Rentals: opening it gives the seeded properties their calendar rows, labelled as estimated: not recorded, and
      // the tenant's points dated from the tenancy in place (over a month old, so already overdue).
      await go('rentals');
      await page.getByRole('heading', { name: 'Rentals', exact: true }).waitFor();
      await block.getByText('Hazards check (29 prescribed hazards)', { exact: true }).first().waitFor();
      await block.getByText(LABEL, { exact: true }).waitFor();
      assert.ok(await fits(page), `Rentals fits at ${width}`);
      if (width === 1280) {
        assert.deepEqual(await todo(), [['checklist', 'missing'], ['deposit_info', 'overdue'], ['eicr_copy', 'overdue'],
          ['hazards', 'missing'], ['licence_change', 'missing'], ['licence_copy', 'overdue']], 'not recorded is never approved');
        for (const label of ['Electrical checklist', 'Licence copy to the tenant', 'EICR copy to the tenant', 'Licence changes notified',
          'Prescribed information with the deposit']) await block.getByText(label, { exact: true }).first().waitFor();
      } else assert.deepEqual(await todo(), [['checklist', 'missing'], ['deposit_info', 'overdue'], ['eicr_copy', 'overdue'],
        ['hazards', 'due60'], ['licence_change', 'due30'], ['licence_copy', 'overdue']]);

      // The property page: the four checks and the calendar's six, in order.
      await go('rentals/1');
      await row('deposit_info').waitFor();
      assert.deepEqual(await page.locator('#checks > li').evaluateAll(items => items.map(li => li.id.replace('check-', ''))),
        ['licence', 'eicr', 'gas', 'alarms', ...NEW]);
      await page.locator('section[aria-labelledby="h-checks"]').getByText(LABEL, { exact: true }).waitFor();
      assert.ok(await fits(page), `the property page fits at ${width}`);

      if (width === 1280) {
        // Hazards: one check with its report's reference; no legal period, so the next review is asked for.
        await row('hazards').getByText('Not recorded', { exact: true }).waitFor();
        await row('licence_copy').getByText('Overdue', { exact: true }).waitFor();
        let dialog = await update('Hazards check (29 prescribed hazards)');
        await dialog.getByText('No legal period is set for this check', { exact: false }).waitFor();
        await dialog.getByLabel('Report reference').fill('Assessment HZ-12, on file');
        await dialog.getByRole('button', { name: 'Save check', exact: true }).click();
        await dialog.getByText('Enter the date of the next review').waitFor();
        await dialog.getByLabel('Next review on').fill(plusDays(today, 45));
        await save(dialog, 'hazards', [`Done ${fmtDay(today)}, expires ${fmtDay(plusDays(today, 45))}`, 'Assessment HZ-12, on file', 'In 45 days']);

        // A licence change made 20 days ago leaves 8 of its 28 days to notify it.
        dialog = await update('Licence changes notified');
        await dialog.getByText(`Starts the 28 days to notify it (estimated, not validated by a lawyer)`, { exact: false }).waitFor();
        assert.equal(await dialog.getByLabel('Notified on').inputValue(), '');
        await dialog.getByLabel('Change made on').fill(plusDays(today, -20));
        await dialog.getByLabel('Note (optional)').fill('Owner contact details changed');
        await save(dialog, 'licence_change', [`Due by ${fmtDay(plusDays(today, 8))}`, 'In 8 days']);

        // Rentals shows both with their dates.
        await go('rentals');
        await block.getByText('In 45 days', { exact: true }).waitFor();
        await block.getByText('In 8 days', { exact: true }).waitFor();
        assert.ok(await fits(page), `Rentals fits after recording at ${width}`);

        // Legal terms: the calendar's periods, versioned with the rest.
        await go('legal');
        const periods = page.locator('form[aria-labelledby="h-periods"]');
        await periods.getByLabel('Licence and EICR copy to the tenant within (days)').waitFor();
        assert.deepEqual([await periods.getByLabel('Licence and EICR copy to the tenant within (days)').inputValue(),
          await periods.getByLabel('Licence changes notified within (days)').inputValue(),
          await periods.getByLabel('Electrical checklist lasts (years)').inputValue()], ['28', '28', '1']);
        assert.ok(await fits(page), `Legal terms fits at ${width}`);
      } else {
        // The change is notified: nothing more falls due, and it keeps its date and reference.
        await row('licence_change').getByText('In 8 days', { exact: true }).waitFor();
        let dialog = await update('Licence changes notified');
        await dialog.getByLabel('Notified on').fill(today);
        await dialog.getByLabel('Note (optional)').fill('Notified, reference EH-7');
        await save(dialog, 'licence_change', [`Done ${fmtDay(today)}`, 'Notified, reference EH-7', 'In date']);
        assert.equal(await row('licence_change').getByText('expires', { exact: false }).count(), 0);

        // A renewed licence starts the 28 days for its copy again, from the licence's date.
        await row('licence_copy').getByText('Overdue', { exact: true }).waitFor();
        dialog = await update('Rental dwelling licence');
        await save(dialog, 'licence', [`Done ${fmtDay(today)}, expires ${fmtDay(addMonths(today, 24))}`]);
        for (const text of [`Due by ${fmtDay(plusDays(today, 28))}`, 'In 28 days']) await row('licence_copy').getByText(text, { exact: false }).waitFor();

        // A one-off has no expiry to enter; the yearly checklist keeps the usual one.
        for (const [kind, label] of [['licence_copy', 'Licence copy to the tenant'], ['deposit_info', 'Prescribed information with the deposit']]) {
          dialog = await update(label);
          assert.equal(await dialog.getByLabel('Expires on (optional)').count(), 0);
          await save(dialog, kind, [`Done ${fmtDay(today)}`, 'In date']);
        }
        dialog = await update('Electrical checklist');
        await dialog.getByText('Blank: 1 year after the date done (estimated, not validated by a lawyer).').waitFor();
        await save(dialog, 'checklist', [`Done ${fmtDay(today)}, expires ${fmtDay(addMonths(today, 12))}`, 'In date']);
        await page.getByRole('heading', { name: /^History/ }).click();
        await page.getByText(`Licence copy to the tenant done ${fmtDay(today)}`, { exact: true }).waitFor();
        assert.ok(await fits(page), `the property page fits after recording at ${width}`);

        // What is left for this property: the hazards review ahead and the EICR copy nobody has given.
        assert.deepEqual(await todo(), [['eicr_copy', 'overdue'], ['hazards', 'due60']]);
        await go('rentals');
        await block.getByText('In 45 days', { exact: true }).waitFor();
        assert.equal(await block.getByText('In 8 days', { exact: true }).count(), 0);
        assert.ok(await fits(page), `Rentals fits after recording at ${width}`);
      }
      assert.deepEqual(errors, []);
      console.log(`ADM-11 ${width}: calendar rows, ${width === 1280 ? 'hazards review, licence change, legal periods' : 'notification, licence renewal, one-offs, checklist, history'}, layout PASS`);
      await context.close();
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
