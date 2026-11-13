const { chromium } = require(process.env.PW || 'playwright-core');
const assert = require('node:assert/strict');
const BASE = process.env.BASE;

(async () => {
  const browser = await chromium.launch();
  try {
    const cases = [
      { state: 'ended', width: 390 }, { state: 'ended', width: 1280 },
      { state: 'unknown', width: 390 }, { state: 'unknown', width: 1280 },
      { state: 'ended', width: 390, replace: true }, { state: 'unknown', width: 1280, replace: true },
    ];
    for (const { state, width, replace } of cases) {
      const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce' });
      const page = await context.newPage(), errors = [];
      page.setDefaultTimeout(10000);
      page.on('pageerror', () => errors.push('page exception'));
      await page.addInitScript(() => localStorage.setItem('hampton-chat', JSON.stringify({ key: 'A'.repeat(43), at: Date.now(), seen: 0 })));
      await page.route('https://fonts.googleapis.com/**', route => route.fulfill({ status: 200, contentType: 'text/css', body: '' }));
      await page.route('**/api/config', route => route.fulfill({ json: { chat: width === 1280 } }));
      let replacementRead = false;
      await page.route('**/api/chat', route => {
        if (replace && (route.request().headers().authorization || '').startsWith('Bearer B')) replacementRead = true;
        return route.fulfill({ json: { status: 'waiting', listing: null,
          messages: [{ id: 1, role: 'visitor', from: null, text: 'Earlier message', at: new Date().toISOString() }] } });
      });
      let sends = 0;
      await page.route('**/api/chat/messages', async route => {
        sends++;
        if (replace) await page.evaluate(() => localStorage.setItem('hampton-chat', JSON.stringify({ key: 'B'.repeat(43), at: Date.now(), seen: 0 })));
        return route.fulfill({ status: 201, json: { accepted: true, chat_state: state } });
      });
      await page.goto(BASE);
      await page.getByRole('button', { name: /^Message us/ }).click();
      const dialog = page.locator('dialog.chat');
      await dialog.getByText('Earlier message').waitFor();
      console.log('MSG-02 fixture ready');
      await dialog.getByLabel('Your message').fill('New message');
      await dialog.getByRole('button', { name: 'Send', exact: true }).click();
      console.log('MSG-02 send attempted');
      if (replace) {
        await page.waitForTimeout(1200);
        assert.ok(replacementRead, 'a replacement chat is read after the acknowledgement');
        assert.ok(await page.evaluate(() => JSON.parse(localStorage.getItem('hampton-chat')).key.startsWith('B')));
      } else {
        await dialog.getByText(/Your message was accepted/).waitFor();
        if (state === 'ended') {
          assert.equal(await page.evaluate(() => localStorage.getItem('hampton-chat')), null);
          assert.ok(await dialog.getByText(/chat is no longer available/i).isVisible());
        } else {
          assert.equal(await dialog.getByLabel('Your message').inputValue(), '');
          assert.ok(await dialog.getByText(/couldn't refresh/i).isVisible());
          assert.notEqual(await page.evaluate(() => localStorage.getItem('hampton-chat')), null);
        }
      }
      assert.equal(sends, 1);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      assert.deepEqual(errors, []);
      await context.close();
    }
  } finally { await browser.close(); }
  console.log('MSG-02 acknowledged-send states: PASS');
})().catch(() => { console.error('MSG-02 acknowledged-send states: FAIL'); process.exitCode = 1; });
