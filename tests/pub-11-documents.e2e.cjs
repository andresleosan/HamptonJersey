// PUB-11: private PDF documents in the listing editor. Local fixture only, synthetic PDFs, PUB11_DOCUMENTS_READY=1.
const { chromium } = require(process.env.PW || 'playwright-core');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { parseEnv } = require('node:util');
const BASE = process.env.BASE, vars = parseEnv(readFileSync(process.env.E2E_VARS, 'utf8'));
const pdf = Buffer.from('%PDF-1.7\nsynthetic e2e document\n%%EOF\n');

(async () => {
  assert.ok(BASE && process.env.E2E_PERSIST, 'isolated local fixture required');
  const { signSession, COOKIE } = await import('../server/auth.js');
  const browser = await chromium.launch({ executablePath: process.env.CHROME });
  try { for (const [width, listing] of [[1280, 'HE-R001'], [390, 'HE-R002']]) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce', acceptDownloads: true });
    await context.addCookies([{ name: COOKIE, value: await signSession('admin@example.test', vars.SESSION_SECRET),
      domain: new URL(BASE).hostname, path: '/', secure: true, httpOnly: true, sameSite: 'Strict' }]);
    const page = await context.newPage(), errors = [];
    page.setDefaultTimeout(10000);
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => {
      const offlineFonts = process.env.E2E_OFFLINE_FONTS === '1' && /^Failed to preconnect to https:\/\/fonts\./.test(message.text());
      if (message.type() === 'error' && !/Failed to load resource/i.test(message.text()) && !offlineFonts) errors.push(message.text());
    });
    await page.goto(`${BASE}admin/#/p/${listing}`);
    const section = page.locator('#s-documents');
    await section.getByRole('heading', { name: 'Private documents' }).waitFor();
    await section.getByText('No private documents yet. Add a PDF below.').waitFor();

    // Keyboard reaches the upload control with a visible focus ring.
    const input = section.locator('input[type=file]');
    await input.focus();
    assert.equal(await input.evaluate(el => el === document.activeElement), true);
    assert.notEqual(await section.locator('.upload').evaluate(el => getComputedStyle(el).outlineStyle), 'none');

    await input.setInputFiles({ name: 'Synthetic survey.pdf', mimeType: 'application/pdf', buffer: pdf });
    await section.getByRole('status').filter({ hasText: '1 document(s) uploaded.' }).waitFor();
    const download = section.getByRole('link', { name: 'Download Synthetic survey' });
    await download.waitFor();

    // A file named .pdf whose bytes are not a PDF is refused by the server.
    await input.setInputFiles({ name: 'fake.pdf', mimeType: 'application/pdf', buffer: Buffer.from('<html>not a pdf</html>') });
    await section.getByRole('alert').filter({ hasText: 'fake.pdf: This file is not a complete PDF' }).waitFor();
    assert.equal(await section.getByRole('listitem').count(), 1);

    // Download as an attachment, private and never cached.
    const href = await download.getAttribute('href');
    const [file] = await Promise.all([page.waitForEvent('download'), download.click()]);
    assert.equal(file.suggestedFilename(), 'Synthetic survey.pdf');
    assert.deepEqual(readFileSync(await file.path()), pdf);
    const direct = await context.request.get(new URL(href, BASE).href);
    assert.equal(direct.status(), 200);
    assert.match(direct.headers()['content-disposition'], /^attachment;/);
    assert.equal(direct.headers()['x-content-type-options'], 'nosniff');
    assert.match(direct.headers()['cache-control'], /no-store/);
    const docId = href.split('/').pop();
    assert.equal((await context.request.get(`${BASE}media/${docId}`)).status(), 404, 'public media never serves documents');
    const anonymous = await browser.newContext();
    assert.equal((await anonymous.request.get(new URL(href, BASE).href)).status(), 401);
    await anonymous.close();

    for (const target of [download, section.getByRole('button', { name: 'Delete Synthetic survey' })]) {
      const box = await target.boundingBox();
      assert.ok(box.height >= 32, `${width}px: target height ${box.height}`);
    }

    // 200% zoom keeps the section within the viewport.
    await page.evaluate(() => { document.documentElement.style.zoom = '2'; });
    const overflow = await page.evaluate(() => ({ width: innerWidth, scroll: document.documentElement.scrollWidth,
      wide: [...document.querySelectorAll('#s-documents *')].filter(e => e.getBoundingClientRect().right > innerWidth + 1)
        .slice(0, 5).map(e => e.tagName) }));
    assert.ok(overflow.wide.length === 0, `no document overflow at 200%: ${JSON.stringify(overflow)}`);
    await page.evaluate(() => { document.documentElement.style.zoom = '1'; });

    // Delete with the keyboard and the confirmation dialog.
    page.once('dialog', dialog => dialog.accept());
    await section.getByRole('button', { name: 'Delete Synthetic survey' }).focus();
    await page.keyboard.press('Enter');
    await section.getByRole('status').filter({ hasText: '"Synthetic survey" deleted.' }).waitFor();
    await section.getByText('No private documents yet. Add a PDF below.').waitFor();
    assert.equal((await context.request.get(new URL(href, BASE).href)).status(), 404);

    // A failed list load shows the error and recovers with Try again.
    let failing = true;
    const route = `**/api/admin/listings/${listing}/documents`;
    const inject = r => (failing && r.request().method() === 'GET'
      ? r.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'Temporarily unavailable' }) })
      : r.continue());
    await page.route(route, inject);
    await page.reload();
    await section.getByRole('alert').filter({ hasText: 'Temporarily unavailable' }).waitFor();
    failing = false;
    await section.getByRole('button', { name: 'Try again' }).click();
    await section.getByText('No private documents yet. Add a PDF below.').waitFor();
    await page.unroute(route, inject);

    assert.deepEqual(errors, []);
    await context.close();
    console.log(`PUB-11 documents ${width}px: upload, refusal, download, delete, error, keyboard and 200% zoom passed.`);
  } } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
