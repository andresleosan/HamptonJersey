// PUB-07: legal and compliance fields in the listing editor. Local fixture only, synthetic data, PUB07_COMPLIANCE_READY=1.
const { chromium } = require(process.env.PW || 'playwright-core');
const assert = require('node:assert/strict');
const { readFileSync, mkdirSync } = require('node:fs');
const { parseEnv } = require('node:util');
const { join } = require('node:path');
const BASE = process.env.BASE, vars = parseEnv(readFileSync(process.env.E2E_VARS, 'utf8'));
const REF = 'LIC-FIXTURE-0001', EPC = 'EPC-FIXTURE-0002';

(async () => {
  assert.ok(BASE && process.env.E2E_PERSIST, 'isolated local fixture required');
  const { signSession, COOKIE } = await import('../server/auth.js');
  const browser = await chromium.launch({ executablePath: process.env.CHROME });
  try { for (const [width, listing] of [[1280, 'HE-R001'], [390, 'HE-R002']]) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce' });
    await context.addCookies([{ name: COOKIE, value: await signSession('admin@example.test', vars.SESSION_SECRET),
      domain: new URL(BASE).hostname, path: '/', secure: true, httpOnly: true, sameSite: 'Strict' }]);
    const page = await context.newPage(), errors = [];
    page.setDefaultTimeout(15000);
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => {
      const offlineFonts = process.env.E2E_OFFLINE_FONTS === '1' && /^Failed to preconnect to https:\/\/fonts\./.test(message.text());
      if (message.type() === 'error' && !/Failed to load resource/i.test(message.text()) && !offlineFonts) errors.push(message.text());
    });
    const request = (path, method = 'GET', body) => page.evaluate(async ({ path, method, body }) => {
      const response = await fetch(path, { method, credentials: 'same-origin', cache: 'no-store',
        headers: body === undefined ? undefined : { 'content-type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body) });
      return { status: response.status, data: await response.json() };
    }, { path, method, body });
    const save = async status => {
      const pending = page.waitForResponse(r => r.request().method() === 'PUT' && new URL(r.url()).pathname === `/api/admin/listings/${listing}`);
      await page.getByRole('button', { name: 'Save', exact: true }).click();
      assert.equal((await pending).status(), status);
    };
    const shot = async name => {
      if (!process.env.E2E_SHOTS) return;
      mkdirSync(process.env.E2E_SHOTS, { recursive: true });
      await section.screenshot({ path: join(process.env.E2E_SHOTS, `pub07-${name}-${width}.png`) });
    };

    await page.goto(`${BASE}admin/#/p/${listing}`);
    const section = page.locator('#s-compliance');
    await section.getByRole('heading', { name: 'Legal and compliance (internal)' }).waitFor();
    const occupancy = section.getByLabel('Occupancy'), licence = section.getByLabel('Rented dwelling licence'),
      energy = section.getByLabel('Energy performance certificate');
    // Every existing listing starts as Unknown, a value of its own next to Not applicable.
    for (const select of [occupancy, licence, energy]) assert.equal(await select.inputValue(), 'unknown');
    assert.deepEqual(await licence.locator('option').allTextContents(), ['Unknown', 'Provided, not verified', 'Verified by staff', 'Not applicable']);
    assert.equal(await section.getByLabel('Licence reference').count(), 0);
    const solicitor = section.getByText("Seller's solicitor:");
    if (listing === 'HE-R001') await section.getByText("Seller's solicitor: recorded in the sale file once an offer is accepted.").waitFor();
    else assert.equal(await solicitor.count(), 0, 'a rental has no seller');

    // The section link reaches it and the keyboard changes a value.
    await page.getByRole('navigation', { name: 'Listing sections' }).getByRole('button', { name: 'Legal and compliance' }).click();
    await occupancy.focus();
    assert.equal(await occupancy.evaluate(el => el === document.activeElement), true);
    assert.notEqual(await occupancy.evaluate(el => getComputedStyle(el).boxShadow), 'none', 'the focused field shows its ring');
    await occupancy.selectOption('tenanted');

    // Provided needs its reference: the server refuses and the focus lands on the field to fix.
    await licence.selectOption('provided');
    const reference = section.getByLabel('Licence reference'), until = section.getByLabel('Licence valid until');
    await save(400);
    await section.getByText('Enter the reference of the document, or choose Unknown').waitFor();
    await page.waitForFunction(() => document.activeElement?.id === 'f-rental_licence_ref');
    assert.equal(await reference.getAttribute('aria-invalid'), 'true');
    await reference.fill(REF);
    await until.fill('2020-01-31');
    await section.getByRole('note').filter({ hasText: 'Expired on 31 Jan 2020. Ask for the current document.' }).waitFor();

    // Verified also needs the expiry date.
    await energy.selectOption('verified');
    await section.getByLabel('Certificate reference').fill(EPC);
    await save(400);
    await section.getByText('Enter the expiry date to mark it as verified').waitFor();
    await section.getByLabel('Certificate valid until').fill('2031-05-01');
    await shot('editing');
    await save(200);
    await page.getByText('Changes saved.').waitFor();

    for (const target of [occupancy, licence, reference, until]) {
      const box = await target.boundingBox();
      assert.ok(box.height >= 32, `${width}px: target height ${box.height}`);
    }
    // 200% zoom keeps the section within the viewport.
    await page.evaluate(() => { document.documentElement.style.zoom = '2'; });
    const wide = await page.evaluate(() => [...document.querySelectorAll('#s-compliance, #s-compliance *')]
      .filter(e => e.getBoundingClientRect().right > innerWidth + 1).slice(0, 5).map(e => e.tagName));
    assert.deepEqual(wide, [], `no overflow at 200%: ${wide}`);
    await page.evaluate(() => { document.documentElement.style.zoom = '1'; });

    // Saved values come back after a reload, are in the history by name only and never reach the website.
    await page.reload();
    await section.getByRole('heading', { name: 'Legal and compliance (internal)' }).waitFor();
    assert.deepEqual([await occupancy.inputValue(), await licence.inputValue(), await reference.inputValue(), await until.inputValue(),
      await energy.inputValue(), await section.getByLabel('Certificate valid until').inputValue()],
    ['tenanted', 'provided', REF, '2020-01-31', 'verified', '2031-05-01']);
    await section.getByRole('note').filter({ hasText: 'Expired on 31 Jan 2020' }).waitFor();
    const history = page.locator('#s-history');
    await history.getByText('Event details', { exact: true }).first().click();
    await history.getByText('Occupancy (internal) changed', { exact: true }).first().waitFor();
    await history.getByText('Licence reference (internal) changed', { exact: true }).first().waitFor();
    assert.ok(!(await history.innerText()).includes(REF));
    const site = await request('/api/listings');
    assert.equal(site.status, 200);
    assert.ok(site.data.some(l => l.id === listing));
    for (const secret of [REF, EPC, 'tenanted', 'occupancy', 'licence']) assert.ok(!JSON.stringify(site.data).includes(secret), secret);

    // Back to Unknown: its evidence fields go away with it.
    await licence.selectOption('unknown');
    assert.equal(await section.getByLabel('Licence reference').count(), 0);
    await energy.selectOption('not_applicable');
    await save(200);
    await page.getByText('Changes saved.').waitFor();
    const detail = await request(`/api/admin/listings/${listing}`);
    assert.deepEqual(['occupancy', 'rental_licence', 'rental_licence_ref', 'rental_licence_valid_until', 'energy_certificate',
      'energy_certificate_ref'].map(k => detail.data.listing[k]), ['tenanted', 'unknown', null, null, 'not_applicable', null]);

    if (listing === 'HE-R001') {
      // The seller's solicitor comes from the listing's own sale file, without contact details.
      const offer = await request('/api/admin/offers', 'POST', { listing_id: listing, applicant_id: 2, amount: 700000 });
      assert.equal(offer.status, 201, JSON.stringify(offer.data));
      const offerId = (await request(`/api/admin/listings/${listing}/offers`)).data.offers[0].id;
      const accepted = await request(`/api/admin/offers/${offerId}/accept`, 'POST', {});
      assert.equal(accepted.status, 201, JSON.stringify(accepted.data));
      const saleId = accepted.data.sale_id, sale = await request(`/api/admin/sales/${saleId}`);
      const updated = await request(`/api/admin/sales/${saleId}`, 'PUT', { updated_at: sale.data.sale.updated_at,
        seller_lawyer_firm: 'Fixture Law', seller_lawyer_name: 'A. Fixture', seller_lawyer_email: 'lawyer@example.test' });
      assert.equal(updated.status, 200, JSON.stringify(updated.data));
      await page.reload();
      await section.getByText("Seller's solicitor: Fixture Law, A. Fixture").waitFor();
      assert.equal(await section.getByRole('link', { name: 'Open the sale file' }).getAttribute('href'), `#/sales/${saleId}`);
      assert.ok(!(await section.innerText()).includes('lawyer@example.test'));
      await shot('solicitor');
    }

    assert.deepEqual(errors, []);
    await context.close();
    console.log(`PUB-07 compliance ${width}px: unknown, evidence rules, expiry, save, reload, history, website, keyboard and 200% zoom passed.`);
  } } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
