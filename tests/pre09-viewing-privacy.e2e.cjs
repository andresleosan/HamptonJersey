const assert = require('node:assert/strict');
const { chromium, webkit } = require(process.env.PW || 'playwright-core');

(async () => {
  assert.equal(process.env.HAMPTON_E2E_ISOLATED, '1');
  assert.equal(process.env.E2E_PRODUCTION_READONLY, '0');
  const browser = await (process.env.HAMPTON_E2E_BROWSER === 'webkit' ? webkit : chromium).launch({ executablePath: process.env.CHROME });
  try {
    for (const width of [1280, 390]) {
      const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce' });
      const page = await context.newPage();
      for (const [path, selector] of [['', '#book-slot'], ['p/HE-R001', '#detail-slot']]) {
        await page.goto(new URL(path, process.env.BASE).href);
        const form = page.locator(`${selector} form.tour`);
        await form.waitFor();
        const name = form.locator('input[name="name"]');
        await name.fill('Synthetic visitor');
        const link = form.getByRole('link', { name: 'privacy notice' });
        assert.equal(await link.getAttribute('href'), '/#/privacy');
        assert.equal(await link.getAttribute('target'), '_blank');
        assert.equal(await link.getAttribute('rel'), 'noopener noreferrer');
        await link.focus();
        assert.equal(await link.evaluate(el => document.activeElement === el), true);
        const opened = context.waitForEvent('page');
        await page.keyboard.press('Enter');
        const privacy = await opened;
        await privacy.getByRole('heading', { name: 'Privacy notice', exact: true }).waitFor();
        assert.equal(new URL(privacy.url()).hash, '#/privacy');
        const notice = privacy.locator('.legal');
        await notice.getByRole('heading', { name: 'Landlords and tenants of homes we manage', exact: true }).waitFor();
        const text = (await notice.innerText()).replace(/\s+/g, ' ');
        for (const phrase of ['management agreement with the landlord and the tenancy agreement',
          'our legal basis is that legal obligation', 'collect the rent', 'protect and settle the deposit',
          'for 6 years after it ends', 'load their typefaces from Google Fonts, so Google receives your IP address',
          'Matterport, YouTube and Vimeo, which play our property tours and videos, receive it only when you open one',
          '(Matterport, YouTube or Vimeo) then receives your IP address', 'Hampton Estates, 42 Bath Street',
          'If you write to our Facebook page, your message reaches us through Facebook (Meta)',
          'We delete a conversation from our systems 30 days after its last message'])
          assert.ok(text.includes(phrase), `privacy notice is missing: ${phrase}`);
        assert.equal(await name.inputValue(), 'Synthetic visitor');
        assert.equal(await form.getByRole('button', { name: 'Request viewing' }).count(), 1);
        await privacy.close();
      }
      await context.close();
    }
  } finally { await browser.close(); }
  console.log('PRE-09 viewing privacy link and notice sections (Rentals, Google Fonts, tour players): home/detail, keyboard, retained form, 1280/390 PASS');
})().catch(error => { console.error(error); process.exitCode = 1; });
