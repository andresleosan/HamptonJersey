// MSG-01: a signed Facebook message reaches Messages, Facebook tab; with sending off the screen says so and Send stays
// disabled; a person links the conversation to a contact and marks it handled. An unsigned call stores nothing. 1280 and
// 390 px. Run only through test:e2e:isolated with the synthetic local fixture (tests/run-e2e.cjs switches MSG-01 on).
const { chromium } = require(process.env.PW || 'playwright-core');
const assert = require('node:assert/strict');
const { readFileSync, mkdirSync } = require('node:fs');
const { parseEnv } = require('node:util');
const { execFileSync } = require('node:child_process');
const { createHmac } = require('node:crypto');
const { join, dirname } = require('node:path');

(async () => {
  assert.ok(process.env.BASE && process.env.E2E_PERSIST && process.env.E2E_VARS, 'isolated fixture required');
  const BASE = process.env.BASE;
  const vars = parseEnv(readFileSync(process.env.E2E_VARS, 'utf8'));
  assert.equal(vars.META_MESSAGES_READY, '1');
  assert.equal(vars.META_SEND_READY, '0');
  const { signSession, COOKIE } = await import('../server/auth.js');
  const wrangler = join(dirname(require.resolve('wrangler')), '..', 'bin', 'wrangler.js');
  const d1 = command => JSON.parse(execFileSync(process.execPath, [wrangler, 'd1', 'execute', 'hampton', '--local',
    '--persist-to', process.env.E2E_PERSIST, '--json', '--command', command], { stdio: 'pipe' }))[0].results;
  const browser = await chromium.launch({ executablePath: process.env.CHROME });
  const shots = process.env.E2E_SHOTS || '/tmp/hampton-shots'; mkdirSync(shots, { recursive: true });
  try {
    for (const width of [1280, 390]) {
      const psid = `20000000000${width}`, page_id = vars.META_PAGE_ID;
      const body = JSON.stringify({ object: 'page', entry: [{ id: page_id, time: Date.now(), messaging: [{ sender: { id: psid },
        recipient: { id: page_id }, timestamp: Date.now(), message: { mid: `m_e2e_${width}`, text: `Is the flat in St Helier free? (${width})` } }] }] });
      const signature = 'sha256=' + createHmac('sha256', vars.META_APP_SECRET).update(body).digest('hex');

      const ctx = await browser.newContext({ viewport: { width, height: 900 }, timezoneId: 'Europe/Jersey', reducedMotion: 'reduce' });
      await ctx.addCookies([{ name: COOKIE, value: await signSession('admin@example.test', vars.SESSION_SECRET),
        domain: new URL(BASE).hostname, path: '/', httpOnly: true, secure: true, sameSite: 'Strict' }]);
      const page = await ctx.newPage(), errors = [];
      page.on('pageerror', e => errors.push(e.message));
      await page.route('https://fonts.googleapis.com/**', route => route.fulfill({ status: 200, contentType: 'text/css', body: '' }));
      page.setDefaultTimeout(15000);
      const fits = () => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1);
      await page.goto(new URL('admin/#/messages', BASE).href);

      // Meta's call, unsigned then signed. Sent from the page, since the webhook does not look at the origin.
      const deliver = sig => page.evaluate(async ([body, sig]) => (await fetch('/api/meta/webhook', { method: 'POST',
        headers: { 'content-type': 'application/json', ...(sig ? { 'x-hub-signature-256': sig } : {}) }, body })).status, [body, sig]);
      assert.equal(await deliver(null), 401);
      assert.equal(d1(`SELECT COUNT(*) AS n FROM channel_messages WHERE external_id = 'm_e2e_${width}'`)[0].n, 0);
      assert.equal(await deliver(signature), 200);
      assert.equal(await deliver(signature), 200, 'a replay is acknowledged');
      assert.equal(d1(`SELECT COUNT(*) AS n FROM channel_messages WHERE external_id = 'm_e2e_${width}'`)[0].n, 1);

      // Messages offers the Facebook channel once the counts say it is on.
      await page.reload();
      await page.getByRole('group', { name: 'Channel' }).getByRole('button', { name: /Facebook/ }).click();
      const item = page.getByRole('list', { name: 'Facebook conversations: Waiting' }).getByRole('button', { name: new RegExp(`St Helier free\\? \\(${width}\\)`) });
      await item.click();
      const title = page.locator('#f-title', { hasText: `Facebook user …${psid.slice(-4)}` });
      await title.waitFor();
      await page.getByText('Sending replies to Facebook is off.').waitFor();
      await page.getByLabel('Reply').fill('Yes, it is. When would you like to view it?');
      assert.equal(await page.getByRole('button', { name: 'Send reply' }).isDisabled(), true, 'Send stays off');
      assert.ok(await fits(), 'Messages fits');
      await page.screenshot({ path: join(shots, `msg01-facebook-${width}.png`), fullPage: true }).catch(() => {});

      // The contact link from MSG-03, saved on the conversation.
      const id = d1(`SELECT id FROM channel_conversations WHERE external_user_id = '${psid}'`)[0].id;
      const card = page.locator(`section[aria-labelledby="cc-${id}"]`);
      await card.getByLabel('Find a contact').fill('Vibert');
      await card.getByRole('button', { name: 'Search' }).click();
      await card.getByRole('list', { name: 'Contacts found' }).getByRole('button', { name: 'Link to Sarah Vibert' }).click();
      await card.getByRole('status').getByText('Chat linked to Sarah Vibert.').waitFor();
      assert.equal(d1(`SELECT contact_id FROM channel_conversations WHERE id = ${id}`)[0].contact_id, 1);

      await page.getByRole('button', { name: 'Mark handled' }).click();
      await page.getByRole('status').getByText('Conversation marked as handled.').waitFor();
      assert.equal(d1(`SELECT status FROM channel_conversations WHERE id = ${id}`)[0].status, 'handled');
      assert.equal(d1("SELECT COUNT(*) AS n FROM channel_messages WHERE direction = 'out'")[0].n, 0, 'nothing was sent');
      assert.deepEqual(errors, []);
      await ctx.close();
    }
    console.log('MSG-01 Facebook messages e2e passed at 1280 and 390 px.');
  } finally {
    await browser.close();
  }
})().catch(e => { console.error(e); process.exit(1); });
