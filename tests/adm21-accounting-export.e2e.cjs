// ADM-21, local synthetic fixture only (run through test:e2e:isolated with ADM09_ARREARS_READY and ADM10_STATEMENTS_READY
// from run-e2e.cjs): Rentals › Accounting export downloads payments, charges and a closed statement as CSV from the
// keyboard, shows an empty range and a refused range in place, and fits at 1280 and 390 px. The server's own answers are
// in tests/server/adm-21-1.test.mjs and adm-21-2.test.mjs.
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
const HEADER = 'schema_version,record_type,record_id,tenancy_ref,date,kind,currency,amount_pence,direction,related_id,revision';

(async () => {
  assert.ok(BASE && process.env.E2E_PERSIST && process.env.E2E_VARS, 'isolated fixture required');
  const vars = parseEnv(readFileSync(process.env.E2E_VARS, 'utf8'));
  assert.equal(vars.ADM10_STATEMENTS_READY, '1');
  const { signSession, COOKIE } = await import('../server/auth.js');
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Jersey', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const [y, m] = today.split('-').map(Number), prev = m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
  const prevEnd = new Date(Date.UTC(y, m - 1, 0)).toISOString().slice(0, 10);
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
      await page.goto(new URL('admin/#/rentals', BASE).href);
      await page.getByRole('heading', { name: 'Rentals', exact: true }).waitFor();

      // A synthetic landlord, property and tenancy from last month, one payment, last month's statement closed.
      const L = (await request(page, '/admin/landlords', 'POST', { name: `Synthetic ADM21 owner ${width}` })).data.landlord.id;
      const property = await request(page, '/admin/rentals', 'POST', { landlord_id: L, address: `Synthetic ADM21 ${width}`,
        parish: 'St Helier', service: 'full', fee_percent: 10 });
      assert.equal(property.status, 201, JSON.stringify(property.data));
      const t = await request(page, `/admin/rentals/${property.data.rental.id}/tenancies`, 'POST', { tenant_name: `Synthetic ${width}`,
        kind: 'periodic', regime: '2025', rent: 1500, start_on: `${prev}-01`, collect_from: `${prev}-01` });
      assert.equal(t.status, 201, JSON.stringify(t.data));
      const ref = t.data.tenancy.payment_ref;
      assert.equal((await request(page, '/admin/payments', 'POST', { tenancy_id: t.data.tenancy.id, received_on: `${prev}-10`,
        amount: 150000 })).status, 201);
      const s = await request(page, `/admin/statements?landlord=${L}&month=${prev}`);
      assert.equal((await request(page, '/admin/statements', 'POST', { landlord: L, month: prev, digest: s.data.digest })).status, 201);

      // Rentals links to the page; last month is chosen by default.
      await page.getByRole('link', { name: 'Accounting export', exact: true }).click();
      await page.getByRole('heading', { name: 'Accounting export', exact: true }).waitFor();
      assert.equal(await page.getByLabel('From').inputValue(), `${prev}-01`);
      assert.equal(await page.getByLabel('To').inputValue(), prevEnd);
      assert.ok(await fits(page), `the page fits at ${width}`);
      await shot(page, `adm21-open-${width}.png`);

      // Payments, from the keyboard.
      await page.getByRole('radio', { name: 'Payments received' }).check();
      await page.getByRole('button', { name: 'Download CSV', exact: true }).focus();
      const download = async () => {
        const [file] = await Promise.all([page.waitForEvent('download'), page.keyboard.press('Enter')]);
        return { name: file.suggestedFilename(), csv: readFileSync(await file.path(), 'utf8') };
      };
      let file = await download();
      assert.equal(file.name, `hampton-payments-${prev}-01-to-${prevEnd}.csv`);
      assert.ok(file.csv.startsWith(HEADER + '\r\n'));
      assert.match(file.csv, new RegExp(`^1,rent_payments,payment-\\d+,${ref},${prev}-10,rent,GBP,150000,credit,,\\d+\\r$`, 'm'));
      await page.getByRole('status').getByText(`: ${file.name}.`).waitFor(); // 1 row at 1280, 2 at 390 (both runs' payments)

      // The closed statement: its lines add up to its net.
      await page.getByRole('radio', { name: 'Closed landlord statements' }).check();
      await page.getByRole('button', { name: 'Download CSV', exact: true }).focus();
      file = await download();
      assert.match(file.csv, /,rent,GBP,150000,credit,/);
      assert.match(file.csv, /,fee,GBP,15000,debit,/);
      assert.match(file.csv, /,net,GBP,135000,credit,,1\r$/m);

      // Charges: last month's rent charge as a debit.
      await page.getByRole('radio', { name: 'Charges and write-offs' }).check();
      await page.getByRole('button', { name: 'Download CSV', exact: true }).focus();
      file = await download();
      assert.match(file.csv, new RegExp(`^1,rent_charges,charge-\\d+,${ref},${prev}-01,rent,GBP,150000,debit,,\\d+\\r$`, 'm'));
      await page.getByRole('status').getByText(/^Downloaded \d+ rows?: hampton-charges-/).waitFor();

      // An empty range downloads nothing; a range ending after today is refused in place, its field marked.
      await page.getByRole('radio', { name: 'Payments received' }).check();
      await page.getByLabel('From').fill('2020-01-01');
      await page.getByLabel('To').fill('2020-01-31');
      await page.getByRole('button', { name: 'Download CSV', exact: true }).click();
      await page.getByRole('status').getByText('Nothing to export in this range.', { exact: true }).waitFor();
      await page.getByLabel('To').fill('2099-01-31');
      await page.getByRole('button', { name: 'Download CSV', exact: true }).click();
      await page.getByRole('alert').getByText('Please check the highlighted fields', { exact: true }).waitFor();
      await page.getByText('Choose an end date up to today', { exact: true }).waitFor();
      assert.equal(await page.getByLabel('To').getAttribute('aria-invalid'), 'true');
      assert.ok(await fits(page), `the refused range fits at ${width}`);
      await shot(page, `adm21-refused-${width}.png`);
      assert.deepEqual(errors, []);
      await context.close();
    }
    console.log('ADM-21 accounting export e2e: ok at 1280 and 390');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exit(1); });
