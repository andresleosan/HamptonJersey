// ADM-17, local synthetic fixture only (run through test:e2e:isolated with ADM17_LEGAL_TERMS_READY=1 from run-e2e.cjs):
// the label on every date worked out with unvalidated legal periods, the Settings page that edits them with versions
// and a refused stale save, Hampton's registrations, and the labels going away once validated. At 1280 and 390 px.
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PW || 'playwright-core');
const { readFileSync } = require('node:fs');
const { parseEnv } = require('node:util');
const BASE = process.env.BASE;
const LABEL = 'Estimated · not validated by a lawyer';
const request = (page, path, method = 'GET', body) => page.evaluate(async ({ path, method, body }) => {
  const response = await fetch('/api' + path, { method, credentials: 'same-origin',
    headers: body ? { 'Content-Type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined });
  return { status: response.status, data: await response.json() };
}, { path, method, body });
const fits = page => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1);

(async () => {
  assert.ok(BASE && process.env.E2E_PERSIST && process.env.E2E_VARS, 'isolated fixture required');
  const vars = parseEnv(readFileSync(process.env.E2E_VARS, 'utf8'));
  assert.equal(vars.ADM17_LEGAL_TERMS_READY, '1');
  const { signSession, COOKIE } = await import('../server/auth.js');
  const { addMonths } = await import('../server/rentals.js');
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Jersey', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  // The panel's fmtDay (admin/src/format.js): "Mon 14 Dec", with the year when it is not this one.
  const fmtDay = d => new Date(`${d}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC',
    ...(d.slice(0, 4) !== today.slice(0, 4) ? { year: 'numeric' } : {}) }).replace(',', '');
  const browser = await chromium.launch({ executablePath: process.env.CHROME });
  try {
    // 1280 leaves the periods estimated (tenant's notice 2 months, after a refused stale save); 390 validates them.
    for (const [width, months] of [[1280, 2], [390, 3]]) {
      const context = await browser.newContext({ viewport: { width, height: 900 }, timezoneId: 'Europe/Jersey', reducedMotion: 'reduce' });
      await context.addCookies([{ name: COOKIE, value: await signSession('admin@example.test', vars.SESSION_SECRET),
        domain: new URL(BASE).hostname, path: '/', httpOnly: true, secure: true, sameSite: 'Strict' }]);
      const page = await context.newPage(), errors = [];
      page.on('pageerror', error => errors.push(error.message));
      page.setDefaultTimeout(9000);
      const go = async hash => { await page.goto(new URL(`admin/#/${hash}`, BASE).href); };

      // Rentals: the status line and the label on the checks and deadlines of the seeded property.
      await go('rentals');
      await page.getByRole('heading', { name: 'Rentals', exact: true }).waitFor();
      const before = (await request(page, '/admin/legal-terms')).data;
      assert.equal(before.terms.status, 'estimated');
      const status = page.locator('#legal-status');
      await status.getByText('Legal periods: estimated, not validated by a lawyer', { exact: false }).waitFor();
      await status.getByText('JFSC registration: not confirmed', { exact: false }).waitFor();
      await page.locator('section[aria-labelledby="h-checks"]').getByText(LABEL, { exact: true }).waitFor();
      assert.ok(await fits(page), `Rentals fits at ${width}`);

      // The property page: its checks, its tenancy's deadlines and the notice dialog's earliest move-out.
      await go('rentals/1');
      await page.locator('section[aria-labelledby="h-checks"]').getByText(LABEL, { exact: true }).waitFor();
      const card = page.locator('#tenancy-1');
      await card.getByRole('heading', { name: 'Deadlines', exact: true }).waitFor();
      await card.getByText(LABEL, { exact: true }).first().waitFor();
      const notice = async n => {
        await card.getByRole('button', { name: 'Record notice', exact: true }).click();
        const dialog = page.getByRole('dialog', { name: 'Record notice' });
        await dialog.getByLabel('Tenant', { exact: true }).check();
        await dialog.getByText(`Earliest move-out: ${fmtDay(addMonths(today, n))}`, { exact: false }).waitFor();
        await dialog.getByText(`gives ${n} month${n === 1 ? '' : 's'}`, { exact: false }).waitFor();
        return dialog;
      };
      let dialog = await notice(before.terms.values.tenantNoticeMonths);
      await dialog.getByText(LABEL, { exact: true }).waitFor();
      assert.ok(await fits(page), `the notice dialog fits at ${width}`);
      await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
      await dialog.waitFor({ state: 'hidden' });
      await page.locator('#check-gas').getByRole('button', { name: 'Update Gas safety' }).click();
      await page.getByRole('dialog').getByText('(estimated, not validated by a lawyer)', { exact: false }).waitFor();
      await page.getByRole('dialog').getByRole('button', { name: 'Cancel', exact: true }).click();

      // Settings › Legal terms, reached from the menu.
      await page.getByRole('button', { name: /^Settings/ }).click();
      await page.getByRole('link', { name: 'Legal terms', exact: true }).click();
      await page.getByRole('heading', { name: 'Legal terms', exact: true }).waitFor();
      const periods = page.locator('form[aria-labelledby="h-periods"]'), field = periods.getByLabel("Tenant's notice, periodic tenancy (months)");
      await periods.getByText(LABEL, { exact: true }).first().waitFor();
      await periods.getByText(before.terms.revision ? `Version ${before.terms.revision}, saved by` : 'Not saved yet:', { exact: false }).waitFor();
      assert.equal(await field.inputValue(), String(before.terms.values.tenantNoticeMonths));
      assert.ok(await fits(page), `Legal terms fits at ${width}`);

      // A period out of range is refused next to its field.
      await field.fill('0');
      await periods.getByText('Unsaved changes').waitFor();
      await periods.getByRole('button', { name: 'Save legal periods' }).click();
      await periods.getByText('Enter a whole number from 1 to 60').waitFor();
      assert.equal(await field.getAttribute('aria-invalid'), 'true');

      // Someone else saves meanwhile: this form's save is refused and nothing is overwritten; Reload brings theirs.
      const other = await request(page, '/admin/legal-terms', 'PUT', { values: { ...before.terms.values, reportDays: 7 },
        status: 'estimated', validated_ref: null, validated_on: null, revision: before.terms.revision });
      assert.equal(other.status, 200, JSON.stringify(other.data));
      await field.fill(String(months));
      await periods.getByRole('button', { name: 'Save legal periods' }).click();
      await periods.getByText('Someone else saved changes here.', { exact: false }).waitFor();
      assert.equal((await request(page, '/admin/legal-terms')).data.terms.revision, before.terms.revision + 1);
      await periods.getByRole('button', { name: 'Reload', exact: true }).click();
      await periods.getByText(`Version ${before.terms.revision + 1}, saved by admin@example.test`, { exact: false }).waitFor();
      await field.fill(String(months));

      if (width === 390) {
        // Validated needs who and when; then the labels go away everywhere.
        await periods.getByLabel('Validated by a Jersey lawyer').check();
        await periods.getByRole('button', { name: 'Save legal periods' }).click();
        await periods.getByText('Enter who validated them and the reference of their advice').waitFor();
        await periods.getByLabel('Validated by, and the reference of their advice').fill('Synthetic adviser, letter of today');
        await periods.getByLabel('Validated on').fill(today);
      }
      await periods.getByRole('button', { name: 'Save legal periods' }).click();
      await page.getByText('Legal periods saved.', { exact: true }).waitFor();
      const after = (await request(page, '/admin/legal-terms')).data.terms;
      assert.deepEqual([after.values.tenantNoticeMonths, after.revision, after.status, after.updated_by],
        [months, before.terms.revision + 2, width === 390 ? 'validated' : 'estimated', 'admin@example.test']);
      if (width === 390) await periods.getByText('Synthetic adviser, letter of today', { exact: false }).waitFor();

      // Hampton's registrations: Registered needs its reference; unknown stays "not confirmed" on Rentals.
      const regs = page.locator('form[aria-labelledby="h-registrations"]'), jfsc = regs.getByRole('group', { name: /^JFSC registration/ });
      if (width === 1280) {
        await jfsc.getByLabel('Registered', { exact: true }).check();
        await regs.getByRole('button', { name: 'Save registrations' }).click();
        await jfsc.getByText('Enter the registration number or where it was confirmed').waitFor();
        await jfsc.getByLabel('Not confirmed', { exact: true }).check();
        await regs.getByRole('button', { name: 'Save registrations' }).click();
      } else {
        await jfsc.getByLabel('Registered', { exact: true }).check();
        await jfsc.getByLabel(/^Registration number/).fill('Synthetic registry entry 123');
        await regs.getByRole('button', { name: 'Save registrations' }).click();
      }
      await page.getByText('Registrations saved.', { exact: true }).waitFor();
      assert.ok(await fits(page), `Legal terms fits after saving at ${width}`);

      // The changed period drives the dialog; the label stays while estimated and goes once validated.
      await go('rentals/1');
      dialog = await notice(months);
      assert.equal(await dialog.getByText(LABEL, { exact: true }).count(), width === 390 ? 0 : 1);
      await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
      await go('rentals');
      await status.getByText(width === 390 ? 'Legal periods: validated' : 'Legal periods: estimated, not validated by a lawyer', { exact: false }).waitFor();
      await status.getByText(width === 390 ? 'JFSC registration: confirmed' : 'JFSC registration: not confirmed', { exact: false }).waitFor();
      await page.getByRole('heading', { name: /^Checks and deadlines/ }).waitFor();
      assert.equal(await page.getByText(LABEL, { exact: true }).count(), width === 390 ? 0 : 1);
      assert.ok(await fits(page), `Rentals fits at ${width}`);
      assert.deepEqual(errors, []);
      console.log(`ADM-17 ${width}: labels, versioned save, stale refusal, registrations${width === 390 ? ', validation' : ''}, layout PASS`);
      await context.close();
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
