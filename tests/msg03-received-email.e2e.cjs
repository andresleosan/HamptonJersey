// The isolated local panel reads synthetic inbox GET responses. This journey never mutates a mailbox or D1.
const assert = require('node:assert/strict');
const { readFileSync, mkdirSync } = require('node:fs');
const { join } = require('node:path');
const { parseEnv } = require('node:util');
const { chromium } = require(process.env.PW || 'playwright-core');

(async () => {
  assert.equal(process.env.HAMPTON_E2E_ISOLATED, '1');
  const base = new URL(process.env.BASE);
  assert.ok(['localhost', '127.0.0.1'].includes(base.hostname));
  const vars = parseEnv(readFileSync(process.env.E2E_VARS, 'utf8'));
  const { COOKIE, signSession } = await import('../server/auth.js');
  const browser = await chromium.launch({ executablePath: process.env.CHROME });
  try {
    for (const width of [1280, 390]) {
      const context = await browser.newContext({ viewport: { width, height: 900 } });
      const noSession = await context.request.get(new URL('/api/admin/email?box=inbound', base).href);
      assert.equal(noSession.status(), 401, 'real local email endpoint requires a staff session');
      await context.addCookies([{ name: COOKIE, value: await signSession('admin@example.test', vars.SESSION_SECRET),
        domain: base.hostname, path: '/', httpOnly: true, secure: true, sameSite: 'Strict' }]);
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      const message = { id: 17, sender: 'viewer@example.test', subject: 'Viewing question', text: 'A synthetic reply.',
        received_at: '2026-11-26T10:00:00.000Z', html_only: 0, truncated: 0, attachments: 0 };
      let present = true;
      await page.route('**/api/admin/email**', async route => {
        const url = new URL(route.request().url());
        assert.equal(route.request().method(), 'GET');
        if (url.pathname === '/api/admin/email' && url.search === '?box=inbound') {
          return route.fulfill({ json: { items: present ? [message] : [], next: null, pending_review: 0 } });
        }
        assert.equal(url.pathname, '/api/admin/email/inbound/17');
        return route.fulfill({ json: { message } });
      });
      await page.goto(new URL('admin/#/messages', base).href);
      const channels = page.getByRole('group', { name: 'Channel' });
      await channels.getByRole('button', { name: 'Received email' }).click();
      await page.waitForURL('**/#/messages?channel=email');
      const inbox = page.getByRole('region', { name: 'Received email' });
      await inbox.getByRole('button', { name: /Viewing question/ }).click();
      await inbox.getByText(message.text, { exact: true }).waitFor();
      assert.equal(await inbox.getByRole('button', { name: 'Delete email' }).count(), 0);
      assert.equal(await inbox.getByRole('button', { name: 'Outgoing' }).count(), 0);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'inbox fits');
      if (process.env.E2E_SHOTS) {
        mkdirSync(process.env.E2E_SHOTS, { recursive: true });
        await page.screenshot({ path: join(process.env.E2E_SHOTS, `msg03-received-${width}.png`), fullPage: true });
      }
      present = false;
      await inbox.getByRole('button', { name: 'Refresh email list' }).click();
      await inbox.getByText('No received emails yet.').waitFor();
      assert.equal(await inbox.getByText(message.text).count(), 0);
      await page.goBack();
      await page.getByRole('group', { name: 'Chats' }).waitFor();
      await page.goForward();
      await inbox.getByText('No received emails yet.').waitFor();
      await channels.getByRole('button', { name: 'Website chat' }).click();
      await page.getByRole('group', { name: 'Chats' }).waitFor();
      assert.deepEqual(errors, []);
      await context.close();
    }
    console.log('MSG-03 received email passed at 1280 and 390 px (synthetic GET responses).');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
