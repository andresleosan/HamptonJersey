// NOT-05, local synthetic fixture only (run through test:e2e:isolated with NOT05_MISSING_PAYMENTS_READY=1 from run-e2e.cjs):
// the Inbox's Missing payments tab with a part-paid tenancy, an ended one and one still in its grace period, the same
// figures as Rentals › To do › Arrears, the grace period with a conflict, and the loading, empty and error states, at
// 1280 and 390 px.
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
const plusDays = (date, n) => new Date(Date.parse(date + 'T12:00:00Z') + n * 864e5).toISOString().slice(0, 10);

(async () => {
  assert.ok(BASE && process.env.E2E_PERSIST && process.env.E2E_VARS, 'isolated fixture required');
  const vars = parseEnv(readFileSync(process.env.E2E_VARS, 'utf8'));
  assert.equal(vars.NOT05_MISSING_PAYMENTS_READY, '1');
  const { signSession, COOKIE } = await import('../server/auth.js');
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Jersey', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const ago = n => plusDays(today, -n);
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

      // Three full-management tenancies: part paid 9 days late, ended four days ago still owing, and due yesterday.
      const owner = await request(page, '/admin/landlords', 'POST', { name: `Synthetic NOT05 owner ${width}` });
      const home = async (address, days) => {
        const property = await request(page, '/admin/rentals', 'POST', { landlord_id: owner.data.landlord.id, address,
          parish: 'St Helier', service: 'full', fee_percent: 10 });
        assert.equal(property.status, 201, JSON.stringify(property.data));
        const tenancy = await request(page, `/admin/rentals/${property.data.rental.id}/tenancies`, 'POST', { tenant_name: `Tenant ${address}`,
          kind: 'periodic', regime: '2025', rent: 1100, start_on: ago(days), collect_from: ago(days) });
        assert.equal(tenancy.status, 201, JSON.stringify(tenancy.data));
        return tenancy.data.tenancy;
      };
      const part = `Synthetic part paid flat ${width}`, gone = `Synthetic ended flat ${width}`, fresh = `Synthetic due yesterday flat ${width}`;
      const partTenancy = await home(part, 9), goneTenancy = await home(gone, 20);
      await home(fresh, 1);
      // Notice given: move-out in 20 days, rent unpaid 12 days. It keeps its arrears step until it moves out.
      const leaving = `Synthetic leaving flat ${width}`, leavingTenancy = await home(leaving, 12);
      assert.equal((await request(page, `/admin/tenancies/${leavingTenancy.id}/end`, 'POST', { ended_on: plusDays(today, 20) })).status, 200);
      assert.equal((await request(page, '/admin/payments', 'POST', { tenancy_id: partTenancy.id, received_on: ago(2), amount: 30000,
        kind: 'rent' })).status, 201);
      assert.equal((await request(page, `/admin/tenancies/${goneTenancy.id}/end`, 'POST', { ended_on: ago(4) })).status, 200);

      // Rentals › To do › Arrears shows the part-paid tenancy: the tab must show the same figures.
      await page.reload();
      const arrears = page.locator('section[aria-labelledby="h-arrears"] tr', { hasText: part });
      await arrears.getByText('£800.00').waitFor();
      await arrears.getByText('9 days').waitFor();
      await arrears.getByRole('cell', { name: 'Call the tenant', exact: true }).waitFor();

      // The tab is in the Inbox when the server has it; opened from the keyboard.
      await page.goto(new URL('admin/#/', BASE).href);
      await page.getByRole('heading', { name: 'Inbox', exact: true }).waitFor();
      const tab = page.getByRole('group', { name: 'Notices' }).getByRole('button', { name: /^Missing payments/ });
      await tab.waitFor();
      await tab.focus();
      await page.keyboard.press('Enter');
      assert.equal(await tab.getAttribute('aria-pressed'), 'true');
      assert.equal(await page.getByRole('group', { name: 'Category' }).count(), 0, 'categories are for notices');
      const table = page.getByRole('table', { name: 'Missing payments' });
      const row = address => table.locator('tbody tr', { hasText: address });
      await row(part).getByText('£800.00').waitFor();
      await row(part).getByText('9 days').waitFor();
      await row(part).getByText('Call the tenant').waitFor();
      await row(part).getByText(`Tenant ${part} · HE-T`).waitFor();
      await row(gone).getByText('£1,100.00').waitFor();
      await row(gone).getByText('Tenancy ended').waitFor();
      await row(gone).getByText('20 days').waitFor();
      await row(leaving).getByText('Tell the landlord').waitFor();
      assert.equal(await row(leaving).getByText('Tenancy ended').count(), 0, 'a move-out still to come is not an ended tenancy');
      assert.equal(await row(fresh).count(), 0, 'still in its grace period');
      const data = (await request(page, '/admin/missing-payments')).data;
      await page.getByText(new RegExp(`^${data.count} tenancies owe £[\\d,]+\\.\\d\\d · Rent shows here 3 days after it falls due$`)).waitFor();
      assert.match(await tab.textContent(), new RegExp(`${data.count}$`));
      const href = await row(part).getByRole('link', { name: part }).getAttribute('href');
      assert.equal(href, `#/rentals/${partTenancy.rental_id}?tenancy=${partTenancy.id}`);

      // Grace period: validation, a save that brings the tenancy due yesterday in, and a conflict that keeps the entry.
      const grace = page.locator('details.grace');
      await grace.locator('summary').click();
      const days = grace.getByLabel('Days after the due date before rent shows here');
      await days.fill('31');
      await grace.getByRole('button', { name: 'Save grace period' }).click();
      await grace.getByText('Enter a whole number of days from 0 to 30').waitFor();
      assert.equal(await days.evaluate(el => el === document.activeElement), true, 'focus on the error');
      assert.equal(await days.getAttribute('aria-invalid'), 'true');
      await days.fill('0');
      await grace.getByRole('button', { name: 'Save grace period' }).click();
      await grace.getByText('Saved. Rent now shows here 0 days after it falls due.').waitFor();
      await row(fresh).getByText(/^1 day(?!s)/).waitFor();
      await row(fresh).getByText('Friendly reminder').waitFor();
      const current = (await request(page, '/admin/missing-payments')).data;
      assert.equal((await request(page, '/admin/missing-payments/grace', 'PUT', { grace_days: 2, expectedRevision: current.revision })).status, 200);
      await days.fill('1');
      await grace.getByRole('button', { name: 'Save grace period' }).click();
      await grace.getByText(/Someone else changed the grace period meanwhile/).waitFor();
      await grace.getByRole('button', { name: 'Reload', exact: true }).click();
      await grace.getByText('Reloaded: the grace period is 2 days. Your entry is kept; save it to use it.').waitFor();
      assert.equal(await days.inputValue(), '1', 'the entry is kept');
      await grace.getByRole('button', { name: 'Save grace period' }).click();
      await grace.getByText('Saved. Rent now shows here 1 day after it falls due.').waitFor();
      await row(fresh).waitFor();

      if (width === 390) {
        for (const [what, locator] of [['tabs', page.getByRole('group', { name: 'Notices' }).getByRole('button')],
          ['grace field and button', grace.locator('input, .btn, summary')], ['property links', table.locator('tbody td:first-child a')]])
          assert.ok(await tall(locator) >= 44, `${what} reach 44px on a phone`);
      }
      assert.ok(await fits(page), 'tab fits');
      if (process.env.E2E_SHOTS) await page.locator('.missing-payments-tab').screenshot({ path: join(process.env.E2E_SHOTS,
        `not05-missing-payments-${width}.png`) }).catch(() => {});
      await page.evaluate(() => { document.documentElement.style.zoom = '2'; });
      assert.ok(await fits(page), 'fits at 200% zoom');
      await page.evaluate(() => { document.documentElement.style.zoom = '1'; });

      // Back to the default for the next width; nothing was paid, charged or marked by the tab.
      const reset = (await request(page, '/admin/missing-payments')).data;
      assert.equal((await request(page, '/admin/missing-payments/grace', 'PUT', { grace_days: 3, expectedRevision: reset.revision })).status, 200);
      const detail = (await request(page, `/admin/tenancies/${partTenancy.id}`)).data;
      assert.deepEqual([detail.balance, detail.payments.length, detail.arrears.done.length], [80000, 1, 0]);

      if (width === 390) { // loading, error with retry, and empty
        let mode = 'down';
        await page.route('**/api/admin/missing-payments', async route => mode === 'slow'
          ? (await new Promise(done => setTimeout(done, 800)), route.continue()) : mode === 'down' ? route.fulfill({ status: 503,
          contentType: 'application/json', body: JSON.stringify({ error: 'Temporarily unavailable' }) })
          : mode === 'empty' ? route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ as_of: today,
            grace_days: 3, revision: 1, count: 0, owed: 0, payments: [] }) }) : route.continue());
        const probed = page.waitForResponse(response => response.url().endsWith('/api/admin/missing-payments'));
        await page.reload();
        await probed;
        await page.getByRole('heading', { name: 'Inbox', exact: true }).waitFor();
        assert.equal(await tab.count(), 0, 'no tab while the server cannot answer');
        mode = 'live';
        await page.reload();
        await tab.click();
        await row(part).waitFor();
        mode = 'slow';
        await page.getByRole('group', { name: 'Notices' }).getByRole('button', { name: 'Feed' }).click();
        await tab.click();
        await page.getByText('Loading missing payments…').waitFor();
        await row(part).waitFor();
        mode = 'down';
        await page.getByRole('group', { name: 'Notices' }).getByRole('button', { name: /^Needs action/ }).click();
        await tab.click();
        const alert = page.getByRole('alert').filter({ hasText: 'Temporarily unavailable' });
        await alert.waitFor();
        mode = 'empty';
        await alert.getByRole('button', { name: 'Try again' }).click();
        await page.getByText(/^No rent payments are missing\./).waitFor();
        await page.getByText('Nothing missing · Rent shows here 3 days after it falls due').waitFor();
        await page.unroute('**/api/admin/missing-payments');
      }
      assert.deepEqual(errors, []);
      await context.close();
      console.log(`NOT-05: ${width}px Missing payments tab, Arrears match, grace period and states passed`);
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
