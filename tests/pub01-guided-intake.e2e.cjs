// PUB-01: «Add new property» creates one draft even when the answer is lost, then opens the editor with its guide, which
// walks every family of data. Local fixture only, synthetic data, PUB-07/08/11 switched on as in production.
const { chromium } = require(process.env.PW || 'playwright-core');
const assert = require('node:assert/strict');
const { readFileSync, mkdirSync, mkdtempSync, writeFileSync } = require('node:fs');
const { parseEnv } = require('node:util');
const { join } = require('node:path');
const { tmpdir } = require('node:os');
const BASE = process.env.BASE, vars = parseEnv(readFileSync(process.env.E2E_VARS, 'utf8'));
const REF = 'LIC-FIXTURE-0001';

(async () => {
  assert.ok(BASE && process.env.E2E_PERSIST, 'isolated local fixture required');
  const { signSession, COOKIE } = await import('../server/auth.js');
  const browser = await chromium.launch({ executablePath: process.env.CHROME });
  try { for (const width of [1280, 390]) {
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
    const request = path => page.evaluate(async path => (await fetch(path, { credentials: 'same-origin', cache: 'no-store' })).json(), path);
    const shot = async name => {
      if (!process.env.E2E_SHOTS) return;
      mkdirSync(process.env.E2E_SHOTS, { recursive: true });
      await page.screenshot({ path: join(process.env.E2E_SHOTS, `pub01-${name}-${width}.png`) });
    };
    const focused = id => page.waitForFunction(id => document.activeElement?.id === id, id);
    const title = `Guided intake fixture ${width}`;
    const withTitle = async () => (await request('/api/admin/listings')).listings.filter(l => l.title === title);

    // The first answer never arrives: the server creates the draft, the browser sees a dropped connection.
    const posts = [];
    await page.route('**/api/admin/listings', async route => {
      if (route.request().method() !== 'POST') return route.continue();
      const response = await route.fetch();
      posts.push({ status: response.status(), body: await response.json(), sent: route.request().postDataJSON() });
      return posts.length === 1 ? route.abort('failed') : route.fulfill({ response });
    });

    await page.goto(`${BASE}admin/#/listings`);
    await page.locator('table.list tbody tr').first().waitFor(); // the list has finished loading
    await page.getByRole('button', { name: 'Add new property' }).first().click();
    const form = page.locator('form.add-property');
    if (width === 1280) {
      // From a folder: property.txt carries the legal lines, shown before creating.
      const dir = join(mkdtempSync(join(tmpdir(), 'hampton-pub01-')), 'Intake fixture');
      mkdirSync(dir);
      writeFileSync(join(dir, 'property.txt'), [`Title: ${title}`, 'Parish: Trinity', 'Bedrooms: 2', 'Occupancy: Tenanted',
        `Rented dwelling licence: ${REF}`, 'Licence valid until: 2027-06-30', 'Energy performance certificate: Not applicable',
        'Certificate valid until: 2030-01-01'].join('\n'));
      await form.locator('input[webkitdirectory]').setInputFiles(dir);
      await form.getByText('details from property.txt').first().waitFor();
      const summary = await form.locator('.import-summary').innerText();
      for (const text of ['Tenanted', `${REF} (provided, not verified)`, '2027-06-30', 'Not applicable',
        "Certificate valid until: needs the reference of its document, so it wasn't imported."]) assert.ok(summary.includes(text), text);
    } else await form.getByLabel('Title').fill(title); // typed by hand, as on a phone

    await form.getByRole('button', { name: 'Create draft' }).click();
    const alert = form.getByRole('alert');
    await alert.getByText('The draft may already exist: trying again never creates it twice.').waitFor();
    assert.equal(await form.getByLabel('Title').isDisabled(), true, 'the details stay locked while the answer is unknown');
    assert.equal((await withTitle()).length, 1, 'the server did create the draft');
    await shot('lost-answer');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth), 0, 'no side scroll');
    const again = form.getByRole('button', { name: 'Try again' });
    assert.ok((await again.boundingBox()).height >= 32);
    await again.focus();
    await page.keyboard.press('Enter');

    // The same draft comes back and opens with its guide.
    await page.waitForURL(/#\/p\/HE-R\d+\?guide=1$/);
    const id = page.url().split('/').pop().split('?')[0];
    assert.deepEqual(posts.map(p => p.status), [201, 200]);
    assert.deepEqual(posts[1].body, { id: posts[0].body.id, replayed: true });
    assert.equal(posts[0].sent.operation_id, posts[1].sent.operation_id);
    assert.equal(id, posts[0].body.id);
    assert.deepEqual((await withTitle()).map(l => l.id), [id], 'trying again made no second listing');

    const guide = page.locator('section[aria-labelledby="h-guide"]');
    await guide.getByText('Step 1 of 6: Identification').waitFor();
    const next = guide.getByRole('button', { name: 'Next step' });
    await guide.getByRole('button', { name: 'Go to Internal property details' }).click(); await focused('h-internal-address');
    await next.click(); await guide.getByText('Step 2 of 6: Physical').waitFor(); await focused('h-physical');
    await next.click(); await guide.getByText('Step 3 of 6: Financial').waitFor(); await focused('h-price');
    await next.click(); await guide.getByText('Step 4 of 6: Legal').waitFor(); await focused('h-compliance');
    assert.equal(await guide.getByText(/not available/).count(), 0, 'the legal step has its section');
    await guide.getByRole('button', { name: 'Go to Private documents' }).click(); await focused('h-documents');
    const legal = await Promise.all(['occupancy', 'rental_licence', 'energy_certificate'].map(k => page.inputValue(`#f-${k}`)));
    if (width === 1280) {
      assert.deepEqual(legal, ['tenanted', 'provided', 'not_applicable'], 'the legal lines of property.txt were saved');
      assert.deepEqual([await page.inputValue('#f-rental_licence_ref'), await page.inputValue('#f-rental_licence_valid_until')], [REF, '2027-06-30']);
    } else assert.deepEqual(legal, ['unknown', 'unknown', 'unknown']);
    await shot('guide-legal');
    await next.click(); await guide.getByText('Step 5 of 6: Marketing').waitFor(); await focused('h-desc');
    for (const [label, target] of [['Website content', 'h-content'], ['Photos', 'h-photos'], ['Tour and specification', 'h-tour']]) {
      await guide.getByRole('button', { name: `Go to ${label}` }).click(); await focused(target);
    }
    await next.click(); await guide.getByText('Step 6 of 6: Review').waitFor(); await focused('h-prepub');
    // The last step says what is still missing; finishing never publishes.
    const missing = await page.locator('section:has(#h-prepub)').innerText();
    for (const text of ['Add photos for the website (0 of 5)', 'Add a summary']) assert.ok(missing.includes(text), text);
    await guide.getByRole('button', { name: 'Go to History' }).click(); await focused('h-history');
    await shot('guide-review');
    await page.evaluate(() => { document.documentElement.style.zoom = '2'; });
    const wide = await page.evaluate(() => [...document.querySelectorAll('section[aria-labelledby="h-guide"], section[aria-labelledby="h-guide"] *')]
      .filter(e => e.getBoundingClientRect().right > innerWidth + 1).slice(0, 5).map(e => e.tagName));
    assert.deepEqual(wide, [], `no overflow at 200%: ${wide}`);
    await page.evaluate(() => { document.documentElement.style.zoom = '1'; });
    await guide.getByRole('button', { name: 'Finish guide' }).click();
    await page.waitForFunction(() => document.activeElement?.textContent === 'Open property guide');
    const detail = await request(`/api/admin/listings/${id}`);
    assert.equal(detail.listing.published, 0, 'the guide never publishes');
    assert.equal(detail.listing.title, title);

    assert.deepEqual(errors, []);
    await context.close();
    console.log(`PUB-01 guided intake ${width}px: lost answer, one draft, guide through every family, legal lines, keyboard and 200% zoom passed.`);
  } } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
