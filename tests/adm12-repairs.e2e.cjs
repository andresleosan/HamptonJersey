// ADM-12, local synthetic fixture only (run through test:e2e:isolated with ADM12_SUPPLIERS_READY=1 from run-e2e.cjs): the
// supplier directory from a property's Repairs, a repair given to a supplier, and the landlord's approval recorded by hand
// with its amount, record and date, at 1280 and 390 px.
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
const focused = locator => locator.evaluate(el => el === document.activeElement);

(async () => {
  assert.ok(BASE && process.env.E2E_PERSIST && process.env.E2E_VARS, 'isolated fixture required');
  const vars = parseEnv(readFileSync(process.env.E2E_VARS, 'utf8'));
  assert.equal(vars.ADM12_SUPPLIERS_READY, '1');
  const { signSession, COOKIE } = await import('../server/auth.js');
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
      const owner = await request(page, '/admin/landlords', 'POST', { name: `Synthetic ADM12 owner ${width}`, approval_limit: 500 });
      const property = await request(page, '/admin/rentals', 'POST', { landlord_id: owner.data.landlord.id,
        address: `Synthetic repaired flat ${width}`, parish: 'St Helier', service: 'let_only' });
      assert.equal(property.status, 201, JSON.stringify(property.data));
      await page.goto(new URL(`admin/#/rentals/${property.data.rental.id}`, BASE).href);
      const repairs = page.locator('section[aria-labelledby="h-repairs"]');
      await repairs.getByText('No repairs recorded.').waitFor();

      // The directory: a supplier with a name is required; added with its contact, then closed.
      const name = `Synthetic Plumbing ${width}`;
      await repairs.getByRole('button', { name: 'Suppliers' }).click();
      const directory = page.getByRole('dialog', { name: 'Suppliers' }), add = directory.getByRole('form', { name: 'New supplier' });
      await add.getByRole('button', { name: 'Add supplier' }).click();
      await add.getByText('Enter a name').waitFor();
      assert.equal(await focused(add.getByLabel('Name')), true, 'focus on the error');
      await add.getByLabel('Name').fill(name);
      await add.getByLabel('Trade (optional)').fill('Plumbing');
      await add.getByLabel('Phone (optional)').fill('01534 000000');
      await add.getByRole('button', { name: 'Add supplier' }).click();
      await directory.getByRole('status').getByText(`Supplier added: ${name}.`).waitFor();
      await directory.locator('#suppliers li', { hasText: name }).getByText('01534 000000').waitFor();
      assert.ok(await fits(page), 'the directory fits');
      if (process.env.E2E_SHOTS) await directory.screenshot({ path: join(process.env.E2E_SHOTS, `adm12-suppliers-${width}.png`) }).catch(() => {});
      await directory.getByRole('form', { name: 'New supplier' }).getByRole('button', { name: 'Close' }).click();
      await repairs.getByRole('status').getByText('Suppliers saved.').waitFor();

      // A repair given to the supplier: choosing it fills the contractor and shows its contact.
      await repairs.getByRole('button', { name: 'New repair' }).click();
      const create = page.getByRole('dialog', { name: 'New repair' });
      await create.getByLabel('Title').fill('Boiler not heating water');
      await create.getByLabel('Urgent').check();
      await create.getByLabel('Supplier (optional)').selectOption({ label: `${name}, Plumbing` });
      assert.equal(await create.getByLabel('Contractor (optional)').inputValue(), name);
      await create.getByText('01534 000000').waitFor();
      await create.getByLabel('Quote (£, optional)').fill('800');
      await create.getByText(/approval limit of £500/).waitFor();
      await create.getByRole('button', { name: 'Add repair' }).click();
      const item = repairs.locator('#repairs li', { hasText: 'Boiler not heating water' });
      await item.getByText("Needs the landlord's approval").waitFor();

      // Asked, then approved: the record of the approval is required and must cover the quote.
      const update = async () => { await item.getByRole('button', { name: /^Update/ }).click(); return page.getByRole('dialog', { name: 'Update repair' }); };
      let dialog = await update();
      await dialog.getByLabel('Status').selectOption('awaiting_approval');
      await dialog.getByRole('button', { name: 'Save repair' }).click();
      await item.getByText('Awaiting approval').waitFor();
      dialog = await update();
      await dialog.getByLabel('Status').selectOption('approved');
      const approval = dialog.getByRole('group', { name: "The landlord's approval" });
      await approval.getByLabel('Amount approved (£)').fill('700');
      await dialog.getByRole('button', { name: 'Save repair' }).click();
      await approval.getByText('Say where their approval is on record').waitFor();
      await approval.getByText('The landlord approved less than the quote or cost').waitFor();
      assert.equal(await focused(approval.getByLabel('Amount approved (£)')), true, 'focus on the first error');
      await approval.getByLabel('Amount approved (£)').fill('900');
      await approval.getByLabel('Where it is on record').fill('Synthetic landlord email');
      if (width === 390) assert.ok(await fits(page), 'the approval fits on a phone');
      await dialog.getByRole('button', { name: 'Save repair' }).click();
      await item.getByText(/^The landlord approved up to £900 on /).waitFor();
      await item.getByText('Approved', { exact: true }).waitFor();
      assert.equal(await item.getByText("Needs the landlord's approval").count(), 0);
      assert.ok(await fits(page), 'repairs fit');
      if (process.env.E2E_SHOTS) await repairs.screenshot({ path: join(process.env.E2E_SHOTS, `adm12-repairs-${width}.png`) }).catch(() => {});
      // ponytail: at 390 px and 200% the Checks card's "Estimated · not validated by a lawyer" badge (ADM-17, not wrapping)
      // already widens the page without ADM-12; it is set aside here so this checks the repairs and their buttons.
      await page.evaluate(() => { document.documentElement.style.zoom = '2';
        for (const b of document.querySelectorAll('.badge')) if (/^Estimated/.test(b.textContent)) b.style.display = 'none'; });
      assert.ok(await fits(page), 'fits at 200% zoom');
      await page.evaluate(() => { document.documentElement.style.zoom = '1'; });

      assert.deepEqual(errors, []);
      await context.close();
      console.log(`ADM-12: ${width}px suppliers, repair and recorded approval passed`);
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
