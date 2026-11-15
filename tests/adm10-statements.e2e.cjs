// ADM-10, local synthetic fixture only (run through test:e2e:isolated with ADM10_STATEMENTS_READY=1 from run-e2e.cjs): last
// month's statement closed from the panel, a late payment that leaves the closed statement as it was until revision 2,
// revision 1 paid so revision 2 shows only the difference, sent and paid marked by hand, the CSV download (formula text escaped), GST shown as not configured and the closing
// panel left out of print, at 1280 and 390 px. The server's own answers are in tests/server/adm-10-statements.test.mjs.
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PW || 'playwright-core');
const { readFileSync } = require('node:fs');
const { parseEnv } = require('node:util');
const { join } = require('node:path');
const BASE = process.env.BASE;
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
  assert.equal(vars.ADM10_STATEMENTS_READY, '1');
  const { signSession, COOKIE } = await import('../server/auth.js');
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Jersey', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const [y, m] = today.split('-').map(Number), prev = m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
  const browser = await chromium.launch({ executablePath: process.env.CHROME });
  try {
    for (const width of [1280, 390]) {
      const context = await browser.newContext({ viewport: { width, height: 900 }, timezoneId: 'Europe/Jersey', reducedMotion: 'reduce',
        acceptDownloads: true });
      await context.addCookies([{ name: COOKIE, value: await signSession('admin@example.test', vars.SESSION_SECRET),
        domain: new URL(BASE).hostname, path: '/', httpOnly: true, secure: true, sameSite: 'Strict' }]);
      const page = await context.newPage(), errors = [];
      page.on('pageerror', error => errors.push(error.message));
      page.setDefaultTimeout(9000);
      const go = async hash => { await page.goto(new URL(`admin/#/${hash}`, BASE).href); };
      await go('rentals');
      await page.getByRole('heading', { name: 'Rentals', exact: true }).waitFor();
      const owner = await request(page, '/admin/landlords', 'POST', { name: `Synthetic ADM10 owner ${width}` });
      const L = owner.data.landlord.id;
      const property = await request(page, '/admin/rentals', 'POST', { landlord_id: L, address: `=Synthetic ADM10 ${width}`,
        parish: 'St Helier', service: 'full', fee_percent: 10 });
      assert.equal(property.status, 201, JSON.stringify(property.data));
      const t = await request(page, `/admin/rentals/${property.data.rental.id}/tenancies`, 'POST', { tenant_name: `Synthetic ${width}`,
        kind: 'periodic', regime: '2025', rent: 1500, start_on: `${prev}-01`, collect_from: `${prev}-01` });
      assert.equal(t.status, 201, JSON.stringify(t.data));
      const pay = async (received_on, amount) => assert.equal((await request(page, '/admin/payments', 'POST',
        { tenancy_id: t.data.tenancy.id, received_on, amount })).status, 201);
      await pay(`${prev}-10`, 150000);

      // Last month, not closed: the live figures, GST shown as not configured.
      await go(`rentals/statements?landlord=${L}&month=${prev}`);
      const panel = page.locator('.statement-close'), totals = page.locator('#statement-totals');
      await panel.getByRole('heading', { name: 'Month end', exact: true }).waitFor();
      await panel.getByText('Not closed yet.', { exact: true }).waitFor();
      await totals.getByText('GST not configured', { exact: true }).waitFor();
      assert.match(await totals.locator('tr.net').innerText(), /£1,350\.00/);
      assert.ok(await fits(page), `the statement fits at ${width}`);
      await shot(page, `adm10-open-${width}.png`);

      // Closed from the keyboard: revision 1.
      await panel.getByRole('button', { name: 'Close statement', exact: true }).focus();
      await page.keyboard.press('Enter');
      await page.getByRole('status').getByText('Statement closed.', { exact: true }).waitFor();
      await panel.getByText(/revision 1, net £1,350\.00\./).waitFor();
      await page.getByText(/· revision 1$/).waitFor();
      await panel.getByRole('button', { name: 'Mark as paid', exact: true }).click();
      await panel.getByText(/^Paid to the landlord on .+ \(admin@example\.test\)\.$/).waitFor();
      const first = (await request(page, `/admin/statements?landlord=${L}&month=${prev}`)).data.closed.id;

      // A late payment for that month: the closed statement stays as it was until revision 2 is closed.
      await pay(`${prev}-25`, 10000);
      await page.reload();
      await panel.getByText(/The figures changed after this statement was closed\./).waitFor();
      assert.match(await totals.locator('tr.net').innerText(), /£1,350\.00/, 'the closed revision is shown, not the live figures');
      await shot(page, `adm10-changed-${width}.png`);
      await panel.getByRole('button', { name: 'Close revision 2', exact: true }).click();
      await panel.getByText(/revision 2, net £1,440\.00\./).waitFor();
      await panel.getByText(/^Revision 1: closed/).waitFor();
      assert.match(await totals.locator('tr.net').innerText(), /£1,440\.00/);

      // Revision 1 was paid: revision 2 shows the difference, not the whole net, and revision 1 takes no more marks.
      await panel.getByText(/^Revision 1 was paid on .+: £1,350\.00\. Still to pay: £90\.00\.$/).waitFor();
      assert.equal(await panel.getByText('Not paid yet.', { exact: true }).count(), 0);
      assert.equal((await request(page, `/admin/statement-runs/${first}/sent`, 'PUT', {})).status, 409);

      // Sent and paid, by hand.
      await panel.getByRole('button', { name: 'Mark as sent', exact: true }).click();
      await panel.getByText(/^Sent to the landlord on .+ \(admin@example\.test\)\.$/).waitFor();
      await panel.getByRole('button', { name: 'Mark as paid', exact: true }).click();
      await panel.getByText(/^Paid to the landlord on .+ \(admin@example\.test\)\.$/).waitFor();
      assert.equal(await panel.getByRole('button', { name: /^Mark as/ }).count(), 0);

      // The CSV is the statement shown, the address's leading = escaped.
      const [download] = await Promise.all([page.waitForEvent('download'),
        page.getByRole('button', { name: 'Download CSV', exact: true }).click()]);
      assert.equal(download.suggestedFilename(), `statement-${L}-${prev}.csv`);
      const csv = readFileSync(await download.path(), 'utf8');
      assert.match(csv, new RegExp(`^"'=Synthetic ADM10 ${width}","rent_received",160000$`, 'm'));
      assert.match(csv, /^"","gst_on_fees",0$/m);
      assert.match(csv, /^"","net_to_landlord",144000$/m);

      // Printed: the statement without the closing panel.
      await page.emulateMedia({ media: 'print' });
      assert.equal(await panel.isVisible(), false);
      assert.equal(await page.locator('#statement').isVisible(), true);
      await page.emulateMedia({ media: 'screen' });
      assert.ok(await fits(page), `the closed statement fits at ${width}`);
      await shot(page, `adm10-closed-${width}.png`);
      assert.deepEqual(errors, []);
      await context.close();
    }
    console.log('ADM-10 statements e2e: ok at 1280 and 390');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exit(1); });
