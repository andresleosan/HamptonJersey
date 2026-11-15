// ADM-20, local synthetic fixture only (run through test:e2e:isolated with ADM20_TENANCY_LAW_READY=1 and
// ADM17_LEGAL_TERMS_READY=1 from run-e2e.cjs): the 2025 tenancy rules in New tenancy, Edit details, Renew and Correct
// charge. 1280 px works with the rules as estimated (every issue asks for the confirmation), then records them as
// validated under Legal terms; 390 px works with them validated (a long initial term and a further fixed term are
// refused, a sum added to what is owed is still declared, and a scope not known only asks). The server's own answers
// are in tests/server/adm-20-tenancy-law.test.mjs.
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PW || 'playwright-core');
const { readFileSync } = require('node:fs');
const { parseEnv } = require('node:util');
const { join } = require('node:path');
const BASE = process.env.BASE;
const shot = (target, name) => (process.env.E2E_SHOTS ? target.screenshot({ path: join(process.env.E2E_SHOTS, name) }).catch(() => {}) : null);
const LABEL = 'Estimated · not validated by a lawyer';
const CONFIRM = 'I have checked this against the agreement and confirm it';
const request = (page, path, method = 'GET', body) => page.evaluate(async ({ path, method, body }) => {
  const response = await fetch('/api' + path, { method, credentials: 'same-origin',
    headers: body ? { 'Content-Type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined });
  return { status: response.status, data: await response.json() };
}, { path, method, body });
const fits = page => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1);

(async () => {
  assert.ok(BASE && process.env.E2E_PERSIST && process.env.E2E_VARS, 'isolated fixture required');
  const vars = parseEnv(readFileSync(process.env.E2E_VARS, 'utf8'));
  assert.deepEqual([vars.ADM20_TENANCY_LAW_READY, vars.ADM17_LEGAL_TERMS_READY], ['1', '1']);
  const { signSession, COOKIE } = await import('../server/auth.js');
  const { addMonths } = await import('../server/rentals.js');
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Jersey', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  // The panel's fmtDay (admin/src/format.js): "Mon 14 Dec", with the year when it is not this one.
  const fmtDay = d => new Date(`${d}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC',
    ...(d.slice(0, 4) !== today.slice(0, 4) ? { year: 'numeric' } : {}) }).replace(',', '');
  const start = `${today.slice(0, 8)}01`, long = addMonths(start, 37), limit = addMonths(start, 36), AGREED = '2026-05-01';
  const browser = await chromium.launch({ executablePath: process.env.CHROME });
  try {
    for (const width of [1280, 390]) {
      const validated = width === 390;
      const context = await browser.newContext({ viewport: { width, height: 900 }, timezoneId: 'Europe/Jersey', reducedMotion: 'reduce' });
      await context.addCookies([{ name: COOKIE, value: await signSession('admin@example.test', vars.SESSION_SECRET),
        domain: new URL(BASE).hostname, path: '/', httpOnly: true, secure: true, sameSite: 'Strict' }]);
      const page = await context.newPage(), errors = [];
      page.on('pageerror', error => errors.push(error.message));
      page.setDefaultTimeout(9000);
      const go = async hash => { await page.goto(new URL(`admin/#/${hash}`, BASE).href); };
      await go('rentals');
      await page.getByRole('heading', { name: 'Rentals', exact: true }).waitFor();
      const owner = await request(page, '/admin/landlords', 'POST', { name: `Synthetic ADM20 owner ${width}` });
      assert.equal(owner.status, 201);
      const property = await request(page, '/admin/rentals', 'POST', { landlord_id: owner.data.landlord.id,
        address: `Synthetic ADM20 law property ${width}`, parish: 'St Helier', service: 'full', fee_percent: 10 });
      assert.equal(property.status, 201);
      const rid = property.data.rental.id;
      assert.equal((await request(page, `/admin/rentals/${rid}`)).data.law.status, validated ? 'validated' : 'estimated');

      // New tenancy: the agreement date and the scope decide the rules; without the date the label is asked for.
      await go(`rentals/${rid}`);
      await page.getByRole('button', { name: 'New tenancy', exact: true }).click();
      const form = page.locator('#new-tenancy'), confirm = form.getByRole('checkbox', { name: CONFIRM, exact: true });
      await form.getByLabel('Agreement date (optional)').waitFor();
      assert.equal(await form.getByRole('radio', { name: 'Not known', exact: true }).isChecked(), true, 'the scope starts as not known');
      await form.getByRole('radio', { name: '2011 law', exact: true }).waitFor();
      await form.getByLabel("Tenant's name").fill(`Synthetic tenant ${width}`);
      await form.getByRole('radio', { name: 'Fixed term', exact: true }).check();
      await form.getByLabel('Agreement date (optional)').fill(AGREED);
      await form.getByText('Recorded under the 2025 rules', { exact: false }).waitFor();
      assert.equal(await form.getByRole('radio', { name: '2011 law', exact: true }).count(), 0, 'the date replaces the label');
      assert.equal(await form.getByText(LABEL, { exact: true }).count(), validated ? 0 : 1);
      await form.getByLabel('Start date', { exact: true }).fill(start);
      await form.getByLabel('End of the fixed term', { exact: true }).fill(long);
      await form.getByLabel('Rent (£ pcm)', { exact: true }).fill('1000');
      // Scope not known: asked about, never refused, whatever the rules' status.
      await form.getByText('It is not recorded whether the 2025 rules apply to this tenancy. If they do, the initial fixed term may run up to 3 years', { exact: false }).waitFor();
      await confirm.waitFor();
      await form.getByRole('radio', { name: 'Yes', exact: true }).check();
      await form.getByText('Under the 2025 rules the initial fixed term may run up to 3 years, and this one runs longer.', { exact: false }).waitFor();
      assert.ok(await fits(page), `New tenancy fits at ${width}`);
      await shot(form, `adm20-new-tenancy-${width}.png`);
      const add = form.getByRole('button', { name: 'Add tenancy', exact: true });
      if (!validated) {
        // Estimated: the save waits for the confirmation.
        await form.getByText('This rule is not yet validated by a lawyer.', { exact: false }).waitFor();
        await add.click();
        await form.locator('#e-nt-law_confirmed').waitFor();
        assert.equal((await request(page, `/admin/rentals/${rid}`)).data.tenancies.length, 0, 'nothing saved without the confirmation');
        await confirm.check();
      } else {
        // Validated: the term is refused, with nothing to tick; a sum owed from the start is still declared.
        await form.locator('p.err[role=note]').waitFor();
        assert.equal(await confirm.count(), 0, 'a refused term offers no confirmation');
        await add.click();
        await form.locator('#e-nt-end_on').waitFor();
        assert.equal((await request(page, `/admin/rentals/${rid}`)).data.tenancies.length, 0, 'a refused term saves nothing');
        await form.locator('#nt-end_on').fill(limit); // its label now carries the refusal
        await form.locator('p.err[role=note]').waitFor({ state: 'detached' });
        await form.getByLabel('Owed today (£, optional)').fill('50.00');
        await form.getByText('a tenant must not be asked for a premium or key money', { exact: false }).waitFor();
        await confirm.check();
        assert.ok(await fits(page), `New tenancy fits with the declaration at ${width}`);
      }
      await add.click();
      await page.getByText(`Tenancy added for Synthetic tenant ${width}`, { exact: false }).waitFor();
      const id = (await request(page, `/admin/rentals/${rid}`)).data.tenancies[0].id, card = page.locator(`#tenancy-${id}`);
      await card.getByText(`Agreed ${fmtDay(AGREED)}: 2025 rules, within the tenancy law`, { exact: false }).waitFor();
      assert.equal(await card.locator('p.meta').getByText(LABEL, { exact: true }).count(), validated ? 0 : 1);
      const saved = (await request(page, `/admin/tenancies/${id}`)).data.tenancy;
      assert.deepEqual([saved.regime, saved.agreement_on, saved.law_scope, saved.end_on], ['2025', AGREED, 'yes', validated ? limit : long]);
      assert.ok(await fits(page), `the property page fits at ${width}`);
      await shot(card, `adm20-tenancy-${width}.png`);

      // Renew: a further fixed term.
      await card.getByRole('button', { name: 'Renew', exact: true }).click();
      const renew = page.getByRole('dialog', { name: 'Renew tenancy', exact: true }), further = addMonths(saved.end_on, 12);
      await renew.getByLabel('New end date').fill(further);
      await renew.getByText('this would be a further fixed term', { exact: false }).waitFor();
      assert.ok(await fits(page), `Renew fits at ${width}`);
      assert.ok(await renew.evaluate(el => el.scrollWidth <= el.clientWidth + 1), `the Renew dialog fits at ${width}`);
      await shot(renew, `adm20-renew-${width}.png`);
      await renew.getByRole('button', { name: 'Renew', exact: true }).click();
      if (!validated) {
        await renew.locator('#e-rn-law_confirmed').waitFor();
        await renew.getByRole('checkbox', { name: CONFIRM, exact: true }).check();
        await renew.getByRole('button', { name: 'Renew', exact: true }).click();
        await renew.waitFor({ state: 'hidden' });
        await card.getByText(`to ${fmtDay(further)}`, { exact: false }).waitFor();
      } else {
        await renew.locator('#e-rn-end_on').waitFor();
        assert.equal(await renew.getByRole('checkbox', { name: CONFIRM, exact: true }).count(), 0);
        assert.equal((await request(page, `/admin/tenancies/${id}`)).data.tenancy.end_on, limit, 'a refused renewal saves nothing');
        await renew.getByRole('radio', { name: 'Periodic', exact: true }).check();
        await renew.getByText('this would be a further fixed term', { exact: false }).waitFor({ state: 'detached' });
        await renew.getByRole('button', { name: 'Renew', exact: true }).click();
        await renew.waitFor({ state: 'hidden' });
        await card.getByText('Periodic from', { exact: false }).waitFor();
      }
      const after = (await request(page, `/admin/tenancies/${id}`)).data;
      assert.deepEqual([after.tenancy.payment_ref, after.tenancy.regime], [saved.payment_ref, '2025']);

      if (!validated) {
        // A charge corrected upwards is declared as no premium; the history keeps every confirmation.
        const charge = after.charges[0];
        await page.locator(`#charges-${id}`).getByRole('button').first().click();
        const correct = page.getByRole('dialog', { name: 'Correct charge', exact: true });
        await correct.getByLabel('Amount (£)').fill('1,050.00');
        await correct.getByText('a tenant must not be asked for a premium or key money', { exact: false }).waitFor();
        await correct.getByRole('button', { name: 'Save charge', exact: true }).click();
        await correct.locator('#e-cc-law_confirmed').waitFor();
        assert.equal((await request(page, `/admin/tenancies/${id}`)).data.charges[0].amount, charge.amount);
        await correct.getByRole('checkbox', { name: CONFIRM, exact: true }).check();
        await correct.getByRole('button', { name: 'Save charge', exact: true }).click();
        await correct.waitFor({ state: 'hidden' });
        await page.locator(`#charges-${id}`).getByText('Corrected by hand', { exact: true }).waitFor();
        await page.getByRole('heading', { name: /^History/ }).click();
        await page.getByText(`Tenancy renewed until ${fmtDay(further)}; 2025 rules checked and confirmed`, { exact: true }).waitFor();
        await page.getByText(`Tenancy entered for Synthetic tenant ${width}; 2025 rules checked and confirmed`, { exact: true }).waitFor();
        assert.ok(await fits(page), `the property page fits with its history at ${width}`);

        // Legal terms: the two parameters, versioned with the rest, then recorded as validated for the next width.
        await go('legal');
        const periods = page.locator('form[aria-labelledby="h-periods"]');
        await periods.getByLabel('Longest initial fixed term, 2025 tenancy rules (years)').waitFor();
        assert.deepEqual([await periods.getByLabel('Longest initial fixed term, 2025 tenancy rules (years)').inputValue(),
          await periods.getByLabel('2025 tenancy rules cover agreements made from').inputValue()], ['3', '2026-04-15']);
        assert.ok(await fits(page), `Legal terms fits at ${width}`);
        await periods.getByRole('radio', { name: 'Validated by a Jersey lawyer', exact: true }).check();
        await periods.getByLabel('Validated by, and the reference of their advice').fill('Synthetic advice, letter 1');
        await periods.getByLabel('Validated on').fill(today);
        await periods.getByRole('button', { name: 'Save legal periods', exact: true }).click();
        await page.getByText('Legal periods saved.', { exact: true }).waitFor();
      } else {
        // The scope set back to not known: the tenancy asks for review, and is neither covered nor cleared.
        await card.getByRole('button', { name: 'Edit details', exact: true }).click();
        const edit = page.getByRole('dialog', { name: 'Tenancy details', exact: true });
        assert.equal(await edit.getByLabel('Agreement date (optional)').inputValue(), AGREED);
        await edit.getByRole('radio', { name: 'Not known', exact: true }).check();
        assert.ok(await edit.evaluate(el => el.scrollWidth <= el.clientWidth + 1), `the details dialog fits at ${width}`);
        await edit.getByRole('button', { name: 'Save', exact: true }).click();
        await edit.waitFor({ state: 'hidden' });
        await card.getByText('It is not recorded whether the 2025 rules apply to this tenancy. Add its agreement date and scope under Edit details.', { exact: false }).waitFor();
        await card.getByText(`Agreed ${fmtDay(AGREED)}: 2025 rules, scope not recorded`, { exact: false }).waitFor();
        assert.ok(await fits(page), `the property page fits with the review note at ${width}`);
      }
      assert.deepEqual(errors, []);
      console.log(`ADM-20 ${width}: ${validated ? 'validated rules refuse the long term and the further fixed term, opening sum declared, scope not known asks for review'
        : 'estimated rules confirmed in New tenancy, Renew and Correct charge, history, legal parameters'}, layout PASS`);
      await context.close();
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
