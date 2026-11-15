// ADM-14, local synthetic fixture only (run through test:e2e:isolated with ADM14_RENEWAL_READY=1 and ADM-15's three
// switches from run-e2e.cjs): within 90 days of a fixed term's end the tenancy card shows the renewal answers and the
// message to send by hand (to the landlord, then to the tenant), the answer is recorded with its date and where it is
// recorded, and Renew and End tenancy come filled in from it; a new rent shows ADM-15's draft. The server's own answers
// are in tests/server/adm-14-renewal.test.mjs.
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PW || 'playwright-core');
const { readFileSync } = require('node:fs');
const { parseEnv } = require('node:util');
const { execFileSync } = require('node:child_process');
const { join, dirname } = require('node:path');
const BASE = process.env.BASE;
// The fixture's local D1, for what only ADM-06's Let agreed flow writes (tenancy_origins) and a photo row.
const wrangler = join(dirname(require.resolve('wrangler')), '..', 'bin', 'wrangler.js');
const sql = statement => execFileSync(process.execPath, [wrangler, 'd1', 'execute', 'hampton', '--local',
  '--persist-to', process.env.E2E_PERSIST, '--command', statement], { stdio: 'pipe' });
const shot = (target, name) => (process.env.E2E_SHOTS ? target.screenshot({ path: join(process.env.E2E_SHOTS, name) }).catch(() => {}) : null);
const request = (page, path, method = 'GET', body) => page.evaluate(async ({ path, method, body }) => {
  const response = await fetch('/api' + path, { method, credentials: 'same-origin',
    headers: body ? { 'Content-Type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined });
  return { status: response.status, data: await response.json() };
}, { path, method, body });
const fits = page => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1);

(async () => {
  assert.ok(BASE && process.env.E2E_PERSIST && process.env.E2E_VARS, 'isolated fixture required');
  const vars = parseEnv(readFileSync(process.env.E2E_VARS, 'utf8'));
  assert.deepEqual([vars.ADM14_RENEWAL_READY, vars.ADM15_RENT_REVIEW_READY, vars.ADM20_TENANCY_LAW_READY], ['1', '1', '1']);
  const { signSession, COOKIE } = await import('../server/auth.js');
  const { addMonths } = await import('../server/rentals.js');
  const { plusDays } = await import('../server/viewings.js');
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Jersey', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const fmtDay = d => new Date(`${d}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC',
    ...(d.slice(0, 4) !== today.slice(0, 4) ? { year: 'numeric' } : {}) }).replace(',', '');
  const full = d => new Date(`${d}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
  const end = plusDays(today, 60), start = addMonths(`${today.slice(0, 8)}01`, -10), from = addMonths(today, 2);
  const browser = await chromium.launch({ executablePath: process.env.CHROME });
  try {
    for (const width of [1280, 390]) {
      const context = await browser.newContext({ viewport: { width, height: 900 }, timezoneId: 'Europe/Jersey', reducedMotion: 'reduce' });
      await context.addCookies([{ name: COOKIE, value: await signSession('admin@example.test', vars.SESSION_SECRET),
        domain: new URL(BASE).hostname, path: '/', httpOnly: true, secure: true, sameSite: 'Strict' }]);
      const page = await context.newPage(), errors = [];
      page.on('pageerror', error => errors.push(error.message));
      page.setDefaultTimeout(9000);
      const go = async hash => { await page.goto(new URL(`admin/#/${hash}`, BASE).href); };
      await go('rentals');
      await page.getByRole('heading', { name: 'Rentals', exact: true }).waitFor();
      const owner = `Synthetic ADM14 owner ${width}`, landlord = await request(page, '/admin/landlords', 'POST', { name: owner });
      assert.equal(landlord.status, 201);
      const make = async name => {
        const property = await request(page, '/admin/rentals', 'POST', { landlord_id: landlord.data.landlord.id,
          address: `Synthetic ADM14 ${name} ${width}`, parish: 'St Helier', service: 'let_only' });
        assert.equal(property.status, 201);
        const t = await request(page, `/admin/rentals/${property.data.rental.id}/tenancies`, 'POST', { tenant_name: `Synthetic ${name} ${width}`,
          kind: 'fixed', rent: 1000, start_on: start, end_on: end, agreement_on: '2026-05-01', law_scope: 'yes' });
        assert.equal(t.status, 201, JSON.stringify(t.data));
        return { rid: property.data.rental.id, id: t.data.tenancy.id, ref: t.data.tenancy.payment_ref, address: `Synthetic ADM14 ${name} ${width}` };
      };
      const answer = async ({ id }, { party, label, rent, source }) => {
        const card = page.locator(`#tenancy-${id}`);
        await card.getByRole('button', { name: 'Record answer', exact: true }).click();
        const dialog = page.getByRole('dialog', { name: 'Record renewal answer', exact: true });
        await dialog.getByLabel(party, { exact: true }).check();
        await dialog.getByLabel(label, { exact: true }).check();
        if (rent) await dialog.getByLabel('New rent (£ pcm)').fill(rent);
        await dialog.getByLabel('Where it is recorded').fill(source);
        assert.ok(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth + 1), `the answer dialog fits at ${width}`);
        await shot(dialog, `adm14-answer-${width}.png`);
        await dialog.getByRole('button', { name: 'Record answer', exact: true }).click();
        await page.getByText(`The ${party.toLowerCase()}'s answer is recorded.`, { exact: true }).waitFor();
        return card;
      };

      // Renewed at a new rent.
      const renewed = await make('renewed');
      await go(`rentals/${renewed.rid}`);
      let card = page.locator(`#tenancy-${renewed.id}`);
      await card.getByRole('heading', { name: 'Renewal answers', exact: true }).waitFor();
      assert.equal(await card.getByText('No answer recorded', { exact: true }).count(), 2);
      await card.getByRole('heading', { name: 'Message to the landlord', exact: true }).waitFor();
      const draft = () => card.locator(`#renewal-draft-${renewed.id}`).inputValue();
      assert.deepEqual((await draft()).split('\n').slice(0, 6), ['DRAFT · nothing is sent from the app',
        `Tenancy renewal · ${renewed.ref} · ${renewed.address}`, '', `Dear ${owner},`, '',
        `The fixed term of Synthetic renewed ${width}'s tenancy at ${renewed.address} ends on ${full(end)}. The rent is £1,000 pcm.`]);
      // Nothing is recorded without what was answered and where.
      await card.getByRole('button', { name: 'Record answer', exact: true }).click();
      let dialog = page.getByRole('dialog', { name: 'Record renewal answer', exact: true });
      await dialog.getByRole('button', { name: 'Record answer', exact: true }).click();
      await dialog.getByText('Say where the answer is recorded', { exact: true }).waitFor();
      await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
      card = await answer(renewed, { party: 'Landlord', label: 'Renew at a new rent', rent: '1050', source: "Landlord's email" });
      await card.getByText(`Renew at a new rent at £1,050 pcm · answered ${fmtDay(today)} · Landlord's email`, { exact: true }).waitFor();
      await card.getByRole('heading', { name: 'Message to the tenant', exact: true }).waitFor();
      await card.getByText('Draft · not validated by a lawyer', { exact: true }).waitFor();
      assert.ok((await draft()).includes(`whose fixed term ends on ${full(end)}, at a rent of £1,050 pcm.`), await draft());
      assert.ok(await fits(page), `the tenancy card fits at ${width}`);
      await shot(card, `adm14-card-${width}.png`);
      // Renew comes with the rent the landlord answered and shows ADM-15's draft.
      await card.getByRole('button', { name: 'Renew', exact: true }).click();
      dialog = page.getByRole('dialog', { name: 'Renew tenancy', exact: true });
      assert.equal(await dialog.getByLabel('New rent (£ pcm, optional)').inputValue(), '1050');
      await dialog.getByLabel('Periodic', { exact: true }).check();
      await dialog.getByLabel('New rent starts on').fill(from);
      await dialog.locator('#cr-notice').waitFor();
      assert.ok((await dialog.locator('#cr-notice').inputValue()).includes('New rent: £1,050 pcm'));
      assert.ok(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth + 1), `the Renew dialog fits at ${width}`);
      await dialog.getByRole('button', { name: 'Renew', exact: true }).click();
      await page.getByText('Tenancy renewed as periodic.', { exact: true }).waitFor();
      await card.getByText('Periodic from', { exact: false }).waitFor(); // reloaded: a periodic tenancy has no renewal answers
      assert.equal(await card.getByRole('heading', { name: 'Renewal answers', exact: true }).count(), 0);
      await page.getByText('History', { exact: false }).first().click();
      await page.getByText(`Landlord answered the renewal of the term ending ${fmtDay(end)}: Renew at a new rent at £1,050 pcm`, { exact: true }).waitFor();

      // Not renewed: the tenant's message says so and End tenancy comes with the term's end date. This tenancy started
      // from a Let agreed listing (ADM-06), whose draft is prepared once.
      const ended = await make('ended');
      const source = await request(page, '/admin/listings', 'POST', { title: `Synthetic ADM14 flat ${width}`, use: 'residential',
        operation: 'rent', availability: 'to_let', country: 'Jersey', rent: 1000, rent_period: 'month', currency: 'GBP', bedrooms: 2 });
      assert.equal(source.status, 201, JSON.stringify(source.data));
      const src = source.data.id, M = `Uadm14x${width}`, TS = `${today}T09:00:00.000Z`;
      sql(`INSERT INTO media (id, listing_id, r2_key, thumb_key, origin, kind, public, position, created_at)
          VALUES ('${M}', '${src}', 'uploads/${M}.jpg', 'thumbs/uploads/${M}.jpg', 'upload', 'photo', 1, 0, '${TS}');
        UPDATE listings SET cover_media_id = '${M}', availability = 'let_agreed' WHERE id = '${src}';
        INSERT INTO tenancy_origins (tenancy_id, operation_id, rental_id, listing_id, applicant_id, listing_updated_at,
          applicant_updated_at, created_at, created_by) VALUES (${ended.id}, 'synthetic-adm14-${width}', ${ended.rid}, '${src}', 1,
          '${TS}', '${TS}', '${TS}', 'admin@example.test');`);
      await go(`rentals/${ended.rid}`);
      card = await answer(ended, { party: 'Landlord', label: 'Not renew', source: 'Phone call, noted in the file' });
      await card.getByText(`Not renew · answered ${fmtDay(today)} · Phone call, noted in the file`, { exact: true }).waitFor();
      assert.ok((await card.locator(`#renewal-draft-${ended.id}`).inputValue()).includes(`The landlord has decided not to renew your tenancy at ${ended.address}.`));
      card = await answer(ended, { party: 'Tenant', label: 'Wants to leave', source: "Tenant's email" });
      await card.getByText(`Wants to leave · answered ${fmtDay(today)} · Tenant's email`, { exact: true }).waitFor();
      await card.getByRole('button', { name: 'End tenancy', exact: true }).click();
      dialog = page.getByRole('dialog', { name: 'End tenancy', exact: true });
      assert.equal(await dialog.getByLabel('Move-out date').inputValue(), end);
      await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
      assert.ok(await fits(page), `the page fits at ${width}`);
      // Prepare listing draft: a new unpublished listing to let from the end date, with the source's photo row; the
      // next click opens the same one.
      await card.getByRole('button', { name: 'Prepare listing draft', exact: true }).click();
      await page.waitForURL(/#\/p\/HE-/);
      const draftId = decodeURIComponent(page.url().split('#/p/')[1]);
      assert.notEqual(draftId, src);
      const made = (await request(page, `/admin/listings/${draftId}`)).data;
      assert.deepEqual([made.listing.title, made.listing.published, made.listing.operation, made.listing.availability, made.listing.available_on],
        [`Synthetic ADM14 flat ${width}`, 0, 'rent', 'to_let', end]);
      assert.deepEqual(made.media.map(m => m.r2_key), [`uploads/${M}.jpg`]);
      await page.getByRole('heading', { name: 'Physical details', exact: true }).waitFor(); // the listing editor
      assert.equal(await page.locator('input[maxlength="200"][required]').first().inputValue(), `Synthetic ADM14 flat ${width}`);
      await shot(page, `adm14-listing-draft-${width}.png`);
      await go(`rentals/${ended.rid}`);
      await card.getByRole('button', { name: 'Open listing draft', exact: true }).click();
      await page.waitForURL(new RegExp(`#/p/${draftId}$`));
      assert.equal(made.listing.cover_media_id === null, false, 'the cover follows');
      // Entered by hand: nothing to copy, said in one line.
      const manual = await make('manual');
      assert.equal((await request(page, `/admin/tenancies/${manual.id}/renewal-answer`, 'POST', { party: 'landlord', answer: 'end',
        answered_on: today, source: 'Letter' })).status, 200);
      await go(`rentals/${manual.rid}`);
      card = page.locator(`#tenancy-${manual.id}`);
      await card.getByText('Entered by hand, not from a Let agreed listing: there is no listing to copy.', { exact: false }).waitFor();
      assert.equal(await card.getByRole('button', { name: 'Prepare listing draft', exact: true }).count(), 0);
      assert.ok(await fits(page), `the hand-entered tenancy fits at ${width}`);
      assert.deepEqual(errors, []);
      await context.close();
    }
    console.log('ADM-14 renewal answers e2e passed');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exit(1); });
