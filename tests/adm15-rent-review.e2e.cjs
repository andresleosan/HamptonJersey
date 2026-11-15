// ADM-15, local synthetic fixture only (run through test:e2e:isolated with ADM15_RENT_REVIEW_READY=1,
// ADM20_TENANCY_LAW_READY=1 and ADM17_LEGAL_TERMS_READY=1 from run-e2e.cjs): Change rent's assistant on the 2025 rules
// (agreement date and scope, never the label), the RPI saved with its source and publication date, the notice draft and
// the history. 1280 px works with the periods as estimated (the draft is internal only) and then records them as
// validated under Legal terms; 390 px works with them validated (a covered tenancy's draft is no longer internal, a
// tenancy with no scope recorded still is, and neither is a letter). The server's own answers are in
// tests/server/adm-15-rent-review.test.mjs.
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PW || 'playwright-core');
const { readFileSync } = require('node:fs');
const { parseEnv } = require('node:util');
const { join } = require('node:path');
const BASE = process.env.BASE;
const shot = (target, name) => (process.env.E2E_SHOTS ? target.screenshot({ path: join(process.env.E2E_SHOTS, name) }).catch(() => {}) : null);
const LABEL = 'Estimated · not validated by a lawyer', SOURCE = 'Synthetic RPI bulletin';
const PERIODS = 'the legal periods are not validated by a lawyer', SCOPE = 'it is not recorded whether the 2025 rules apply to this tenancy';
const NO_TEMPLATE = 'No notice letter template validated by a Jersey lawyer exists yet. Nothing is sent from the app.';
const request = (page, path, method = 'GET', body) => page.evaluate(async ({ path, method, body }) => {
  const response = await fetch('/api' + path, { method, credentials: 'same-origin',
    headers: body ? { 'Content-Type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined });
  return { status: response.status, data: await response.json() };
}, { path, method, body });
const fits = page => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1);

(async () => {
  assert.ok(BASE && process.env.E2E_PERSIST && process.env.E2E_VARS, 'isolated fixture required');
  const vars = parseEnv(readFileSync(process.env.E2E_VARS, 'utf8'));
  assert.deepEqual([vars.ADM15_RENT_REVIEW_READY, vars.ADM20_TENANCY_LAW_READY, vars.ADM17_LEGAL_TERMS_READY], ['1', '1', '1']);
  const { signSession, COOKIE } = await import('../server/auth.js');
  const { addMonths } = await import('../server/rentals.js');
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Jersey', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  // The panel's fmtDay (admin/src/format.js): "Mon 14 Dec", with the year when it is not this one.
  const fmtDay = d => new Date(`${d}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC',
    ...(d.slice(0, 4) !== today.slice(0, 4) ? { year: 'numeric' } : {}) }).replace(',', '');
  // The draft's dates (fmtDayMonth): "14 Dec 2026", always with the year.
  const full = d => new Date(`${d}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
  const month = `${today.slice(0, 8)}01`, start = addMonths(month, -14), published = addMonths(month, -1), earliest = addMonths(today, 2);
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
      const owner = await request(page, '/admin/landlords', 'POST', { name: `Synthetic ADM15 owner ${width}` });
      assert.equal(owner.status, 201);
      // One property and tenancy each: covered (a 2025 agreement in scope, whatever its label), no agreement date nor
      // scope (its label says 2025), and agreed before the rules start.
      const make = async (name, over) => {
        const property = await request(page, '/admin/rentals', 'POST', { landlord_id: owner.data.landlord.id,
          address: `Synthetic ADM15 ${name} ${width}`, parish: 'St Helier', service: 'let_only' });
        assert.equal(property.status, 201);
        const t = await request(page, `/admin/rentals/${property.data.rental.id}/tenancies`, 'POST', { tenant_name: `Synthetic ${name} ${width}`,
          kind: 'periodic', rent: 1000, start_on: start, ...over });
        assert.equal(t.status, 201, JSON.stringify(t.data));
        return { rid: property.data.rental.id, id: t.data.tenancy.id, ref: t.data.tenancy.payment_ref };
      };
      const covered = await make('covered', { agreement_on: '2026-05-01', law_scope: 'yes' });
      const unknown = await make('unrecorded', { regime: '2025' });
      const before = await make('earlier', { agreement_on: '2026-01-10', law_scope: 'yes' });
      assert.equal((await request(page, `/admin/tenancies/${covered.id}`)).data.law.status, validated ? 'validated' : 'estimated');
      const open = async ({ rid, id }) => {
        await go(`rentals/${rid}`);
        await page.locator(`#tenancy-${id}`).getByRole('button', { name: 'Change rent', exact: true }).click();
        const dialog = page.getByRole('dialog', { name: 'Change rent', exact: true });
        await dialog.getByLabel('New rent (£ pcm)').waitFor();
        return dialog;
      };
      const draftOf = async dialog => { await dialog.locator('#cr-notice').waitFor(); return dialog.locator('#cr-notice').inputValue(); };

      // Covered: the estimate reads the rules in force, not the label.
      let dialog = await open(covered);
      await dialog.getByRole('heading', { name: 'Rent estimate (2025 rules)', exact: true }).waitFor();
      assert.equal(await dialog.getByText('recorded 2025 label', { exact: false }).count(), 0, 'the label is no longer what decides');
      assert.equal(await dialog.getByText(LABEL, { exact: true }).count(), validated ? 0 : 1);
      if (!validated) {
        // No RPI yet: no limit, and none without its source and the date it was published.
        await dialog.getByText("Enter Jersey's RPI with its source and publication date to work out the limit.", { exact: true }).waitFor();
        assert.equal(await dialog.getByText('Use estimate in form', { exact: false }).count(), 0, 'no limit without an RPI');
        await dialog.getByLabel('Jersey RPI (%)').fill('3.2');
        await dialog.getByLabel('Published on').fill(published);
        await dialog.getByRole('button', { name: 'Save RPI', exact: true }).click();
        await dialog.locator('#e-rpi-source').waitFor();
        assert.deepEqual((await request(page, '/admin/settings/rpi')).data, { rpi: null }, 'nothing saved without the source');
        await dialog.locator('#rpi-source').fill(SOURCE);
        assert.ok(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth + 1), `the RPI form fits at ${width}`);
        await dialog.getByRole('button', { name: 'Save RPI', exact: true }).click();
      }
      await dialog.getByText(`Jersey RPI: 3.2% published ${fmtDay(published)} (${SOURCE})`, { exact: false }).waitFor();
      assert.deepEqual((await request(page, '/admin/settings/rpi')).data, { rpi: { percent: 3.2, as_of: published, source: SOURCE } });
      assert.equal(await dialog.locator('#cr-notice').count(), 0, 'no draft before a change is typed');
      await dialog.getByRole('button', { name: `Use estimate in form (£1,032 pcm from ${fmtDay(earliest)})`, exact: true }).click();
      let draft = await draftOf(dialog);
      assert.deepEqual(draft.split('\n'), [validated ? 'DRAFT · not a notice letter' : 'DRAFT · internal only · not a notice letter',
        `Rent change for Synthetic covered ${width} · ${covered.ref} · Synthetic ADM15 covered ${width}`,
        'Agreement: made 1 May 2026, recorded as within the 2025 tenancy rules',
        'Current rent: £1,000 pcm', 'New rent: £1,032 pcm', `Starts on: ${full(earliest)}`,
        `Earliest date, worked out on ${full(today)}: ${full(earliest)} (2 months' notice from that day, 12 months after the start)`,
        `Jersey RPI: 3.2%, published ${full(published)}, source: ${SOURCE}`, 'Limit worked out: £1,032 pcm',
        validated ? 'The legal periods are validated and the tenancy is recorded under the 2025 rules.' : `Not for the tenant: ${PERIODS}.`, NO_TEMPLATE]);
      await dialog.getByText('Draft · not a notice letter', { exact: true }).waitFor();
      // Above the limit and before the earliest date: said in the dialog and in the draft, and still the employee's call.
      await dialog.getByLabel('New rent (£ pcm)').fill('1100');
      await dialog.getByLabel('Starts on', { exact: true }).fill(today);
      await dialog.getByText('Above the estimated limit.', { exact: false }).waitFor();
      await dialog.getByText(`Earlier than the estimated date of ${fmtDay(earliest)}.`, { exact: false }).waitFor();
      draft = await draftOf(dialog);
      assert.ok(draft.includes('Limit worked out: £1,032 pcm: the new rent is ABOVE it') && draft.includes('): the start is EARLIER'), draft);
      await dialog.getByRole('button', { name: 'Copy draft', exact: true }).click();
      await dialog.getByText(/^Draft (copied\.|selected: copy it with your keyboard\.)$/).waitFor();
      assert.ok(await fits(page), `Change rent fits at ${width}`);
      assert.ok(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth + 1), `the Change rent dialog fits at ${width}`);
      await shot(dialog, `adm15-change-rent-${width}.png`);
      await dialog.getByRole('button', { name: 'Change rent', exact: true }).click();
      await dialog.waitFor({ state: 'hidden' });
      await page.locator(`#tenancy-${covered.id}`).getByText('£1,100 pcm', { exact: false }).first().waitFor();
      // The change keeps the RPI it was worked out with, and the history says what it went beyond.
      const event = (await request(page, `/admin/rentals/${covered.rid}`)).data.events.find(e => e.type === 'rent.changed');
      assert.deepEqual(event.data, { before: 1000, rent: 1100, effective_on: today, review: { cover: 'yes', status: validated ? 'validated' : 'estimated',
        rpi: { percent: 3.2, as_of: published, source: SOURCE }, max_rent: 1032, earliest_on: earliest } });
      await page.getByRole('heading', { name: /^History/ }).click();
      await page.getByText(`Rent changed from £1,000 to £1,100 pcm from ${fmtDay(today)}; RPI 3.2% published ${fmtDay(published)} (${SOURCE}), limit £1,032 (above it), before the earliest date worked out (${fmtDay(earliest)})`, { exact: true }).waitFor();
      assert.ok(await fits(page), `the property page fits with its history at ${width}`);

      // No agreement date nor scope: said, the estimate only as a condition, and the draft internal whatever the periods.
      dialog = await open(unknown);
      await dialog.getByRole('heading', { name: 'Rent estimate (only if the 2025 rules apply)', exact: true }).waitFor();
      await dialog.getByText('It is not recorded whether the 2025 rules apply to this tenancy: add its agreement date and scope under Edit details.', { exact: false }).waitFor();
      await dialog.getByRole('button', { name: `Use estimate in form (£1,032 pcm from ${fmtDay(earliest)})`, exact: true }).click();
      draft = await draftOf(dialog);
      for (const line of ['DRAFT · internal only · not a notice letter', 'Agreement: date not recorded, not recorded whether the 2025 tenancy rules apply',
        `Not for the tenant: ${validated ? '' : `${PERIODS}; `}${SCOPE}.`, NO_TEMPLATE])
        assert.ok(draft.split('\n').includes(line), `the draft says "${line}" at ${width}:\n${draft}`);
      assert.ok(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth + 1), `the dialog fits with an internal draft at ${width}`);
      await shot(dialog, `adm15-unrecorded-${width}.png`);
      await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
      await dialog.waitFor({ state: 'hidden' });

      // Agreed before the rules start: no estimate and no draft; the rent can still be changed by hand.
      dialog = await open(before);
      await dialog.getByText('The 2025 rules are not recorded as covering this tenancy', { exact: false }).waitFor();
      assert.equal(await dialog.getByRole('heading', { name: /^Rent estimate/ }).count(), 0);
      await dialog.getByLabel('New rent (£ pcm)').fill('1200');
      await dialog.getByLabel('Starts on', { exact: true }).fill(earliest);
      await dialog.getByRole('button', { name: 'Change rent', exact: true }).click();
      await dialog.waitFor({ state: 'hidden' });
      assert.equal(await page.locator('#cr-notice').count(), 0, 'no draft for a tenancy the rules do not cover');
      await page.getByRole('heading', { name: /^History/ }).click();
      await page.getByText(`Rent changed from £1,000 to £1,200 pcm from ${fmtDay(earliest)}; no estimate, the 2025 rules are not recorded as covering it`, { exact: true }).waitFor();

      if (!validated) {
        // Legal terms: the periods recorded as validated for the next width.
        await go('legal');
        const periods = page.locator('form[aria-labelledby="h-periods"]');
        await periods.getByRole('radio', { name: 'Validated by a Jersey lawyer', exact: true }).check();
        await periods.getByLabel('Validated by, and the reference of their advice').fill('Synthetic advice, letter 1');
        await periods.getByLabel('Validated on').fill(today);
        await periods.getByRole('button', { name: 'Save legal periods', exact: true }).click();
        await page.getByText('Legal periods saved.', { exact: true }).waitFor();
      }
      assert.deepEqual(errors, []);
      console.log(`ADM-15 ${width}: ${validated ? 'validated periods: a covered tenancy\'s draft is no longer internal and still no letter, no scope recorded stays internal'
        : 'RPI saved only with its source, limit and draft from the 2025 rules, estimated periods keep the draft internal'}, change kept with its RPI in the history, not covered has no estimate, layout PASS`);
      await context.close();
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
