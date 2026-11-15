// ADM-09, local synthetic fixture only (run through test:e2e:isolated with ADM09_ARREARS_READY=1 from run-e2e.cjs): on a
// property page, the arrears step's draft to send by hand (the formal letter, marked as not validated by a lawyer, copied
// and downloaded; a friendly reminder), a write-off with its reason, a stale one refused, its reversal and the history,
// at 1280 and 390 px. The server's own answers are in tests/server/adm-09-writeoffs.test.mjs.
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
const plusDays = (date, n) => new Date(Date.parse(date + 'T12:00:00Z') + n * 864e5).toISOString().slice(0, 10);

(async () => {
  assert.ok(BASE && process.env.E2E_PERSIST && process.env.E2E_VARS, 'isolated fixture required');
  const vars = parseEnv(readFileSync(process.env.E2E_VARS, 'utf8'));
  assert.equal(vars.ADM09_ARREARS_READY, '1');
  const { signSession, COOKIE } = await import('../server/auth.js');
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Jersey', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const ago = n => plusDays(today, -n);
  const full = d => new Date(`${d}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
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
      const owner = await request(page, '/admin/landlords', 'POST', { name: `Synthetic ADM09 owner ${width}` });
      const home = async (name, days) => {
        const property = await request(page, '/admin/rentals', 'POST', { landlord_id: owner.data.landlord.id,
          address: `Synthetic ADM09 ${name} ${width}`, parish: 'St Helier', service: 'full', fee_percent: 10 });
        assert.equal(property.status, 201, JSON.stringify(property.data));
        const t = await request(page, `/admin/rentals/${property.data.rental.id}/tenancies`, 'POST', { tenant_name: `Synthetic ${name} ${width}`,
          kind: 'periodic', regime: '2025', rent: 1100, start_on: ago(days), collect_from: ago(days) });
        assert.equal(t.status, 201, JSON.stringify(t.data));
        return { rid: property.data.rental.id, id: t.data.tenancy.id, ref: t.data.tenancy.payment_ref, address: `Synthetic ADM09 ${name} ${width}` };
      };
      const late = await home('late', 20), recent = await home('recent', 2);

      // 20 days late: the formal letter's draft, never presented as validated, to copy or download.
      await go(`rentals/${late.rid}`);
      const card = page.locator(`#tenancy-${late.id}`);
      await card.getByRole('heading', { name: 'Formal letter draft', exact: true }).waitFor();
      await card.getByText('Draft · not validated by a lawyer', { exact: true }).waitFor();
      const box = card.locator(`#arrears-draft-${late.id}`), letter = await box.inputValue();
      const lines = letter.split('\n');
      assert.equal(lines[0], 'DRAFT · not validated by a lawyer · check it before it is sent');
      for (const line of [full(today), `Synthetic late ${width}`, late.address, `Rent arrears · payment reference ${late.ref}`,
        `Our records show £1,100.00 of rent unpaid on this tenancy. The oldest unpaid rent fell due on ${full(ago(20))}, 20 days ago.`,
        `Please pay by bank transfer quoting ${late.ref}, or contact us to agree how it will be paid.`])
        assert.ok(lines.includes(line), `the letter says "${line}":\n${letter}`);
      await card.getByRole('button', { name: 'Copy draft', exact: true }).click();
      await card.getByText(/^Draft (copied\.|selected: copy it with your keyboard\.)$/).waitFor();
      const [download] = await Promise.all([page.waitForEvent('download'), card.getByRole('button', { name: 'Download draft', exact: true }).click()]);
      assert.equal(download.suggestedFilename(), `${late.ref}-letter.txt`);
      assert.equal(readFileSync(await download.path(), 'utf8'), letter, 'the file is the draft shown');
      assert.ok(await fits(page), `the property page fits with its draft at ${width}`);
      await shot(card, `adm09-letter-${width}.png`);

      // A write-off from the keyboard: its reason is required, it is no payment and the balance follows.
      const writeOff = card.getByRole('button', { name: 'Write off rent owed', exact: true });
      await writeOff.focus();
      await page.keyboard.press('Enter');
      let dialog = page.getByRole('dialog', { name: 'Write off rent', exact: true });
      assert.equal(await dialog.getByLabel('Amount (£)').inputValue(), '1,100.00');
      await dialog.getByRole('button', { name: 'Write off', exact: true }).click();
      await dialog.getByText('Say why this rent is written off', { exact: true }).waitFor();
      await dialog.getByLabel('Amount (£)').fill('600');
      await dialog.getByLabel('Reason').fill('Agreed with the landlord');
      assert.ok(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth + 1), `the write-off dialog fits at ${width}`);
      await shot(dialog, `adm09-writeoff-${width}.png`);
      await dialog.getByRole('button', { name: 'Write off', exact: true }).click();
      await dialog.waitFor({ state: 'hidden' });
      await card.getByText(`£600.00 written off for Synthetic late ${width}.`, { exact: true }).waitFor();
      await card.locator('.balance').getByText('£500.00', { exact: true }).waitFor();
      await card.getByText('£600.00 written off', { exact: false }).first().waitFor();
      let d = (await request(page, `/admin/tenancies/${late.id}`)).data;
      assert.equal(d.payments.length, 0, 'a write-off is no payment');
      assert.equal(d.writeoffs[0].reason, 'Agreed with the landlord');

      // A payment while the dialog is open: refused, nothing written.
      await writeOff.click();
      dialog = page.getByRole('dialog', { name: 'Write off rent', exact: true });
      await dialog.getByLabel('Reason').fill('Second thoughts');
      assert.equal((await request(page, '/admin/payments', 'POST', { tenancy_id: late.id, received_on: today, amount: 10000, kind: 'rent' })).status, 201);
      await dialog.getByRole('button', { name: 'Write off', exact: true }).click();
      await dialog.getByText('The balance changed meanwhile. Reload to see it', { exact: true }).waitFor();
      await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
      d = (await request(page, `/admin/tenancies/${late.id}`)).data;
      assert.deepEqual([d.writeoffs.length, d.balance], [1, 40000]);

      // The reversal makes it owed again, once; the history says both.
      await card.locator('.balance').getByText('£400.00', { exact: true }).waitFor();
      await card.getByRole('button', { name: 'Reverse the write-off of £600.00', exact: true }).click();
      dialog = page.getByRole('dialog', { name: 'Reverse write-off', exact: true });
      await dialog.getByLabel('Reason').fill('Landlord changed their mind');
      await dialog.getByRole('button', { name: 'Reverse', exact: true }).click();
      await dialog.waitFor({ state: 'hidden' });
      await card.locator('.balance').getByText('£1,000.00', { exact: true }).waitFor();
      await card.getByText(/Reversed .*: Landlord changed their mind/).waitFor();
      assert.equal(await card.getByRole('button', { name: 'Reverse the write-off of £600.00', exact: true }).count(), 0);
      await page.getByRole('heading', { name: /^History/ }).click();
      await page.getByText('£600.00 of rent written off', { exact: true }).waitFor();
      await page.getByText('Write-off of £600.00 reversed: owed again', { exact: true }).waitFor();
      assert.ok(await fits(page), `the property page fits with its write-offs at ${width}`);
      await shot(card, `adm09-reversed-${width}.png`);

      // Two days late: the friendly reminder's draft; nothing is sent from the app.
      await go(`rentals/${recent.rid}`);
      const other = page.locator(`#tenancy-${recent.id}`);
      await other.getByRole('heading', { name: 'Friendly reminder draft', exact: true }).waitFor();
      await other.getByText('Draft · nothing is sent from the app', { exact: true }).waitFor();
      assert.ok((await other.locator(`#arrears-draft-${recent.id}`).inputValue()).includes(`has not reached us yet: £1,100.00 is owed.`));
      assert.ok(await fits(page), `the reminder fits at ${width}`);

      assert.deepEqual(errors, []);
      console.log(`ADM-09 ${width}: letter draft (copy, download) and reminder draft, write-off with reason, stale refused, reversal and history, layout PASS`);
      await context.close();
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
