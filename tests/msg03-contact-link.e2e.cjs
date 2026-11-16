// MSG-03: from Messages a person links a website chat to an existing contact (a suggestion by email, or the search),
// a stale panel gets 409, the contact's record lists the chat and opens it, and Unlink removes it. 1280 and 390 px.
// Run only through test:e2e:isolated with the synthetic local fixture (MSG03_CONTACT_LINK_READY on in tests/run-e2e.cjs).
const { chromium } = require(process.env.PW || 'playwright-core');
const assert = require('node:assert/strict');
const { readFileSync, mkdirSync } = require('node:fs');
const { parseEnv } = require('node:util');
const { execFileSync } = require('node:child_process');
const { join, dirname } = require('node:path');

(async () => {
  assert.ok(process.env.BASE && process.env.E2E_PERSIST && process.env.E2E_VARS, 'isolated fixture required');
  const BASE = process.env.BASE;
  const vars = parseEnv(readFileSync(process.env.E2E_VARS, 'utf8'));
  assert.equal(vars.MSG03_CONTACT_LINK_READY, '1');
  const { signSession, COOKIE } = await import('../server/auth.js');
  const wrangler = join(dirname(require.resolve('wrangler')), '..', 'bin', 'wrangler.js');
  const d1 = command => JSON.parse(execFileSync(process.execPath, [wrangler, 'd1', 'execute', 'hampton', '--local',
    '--persist-to', process.env.E2E_PERSIST, '--json', '--command', command], { stdio: 'pipe' }))[0].results;
  const linkedTo = id => d1(`SELECT contact_id FROM chats WHERE id = ${id}`)[0].contact_id;
  const browser = await chromium.launch({ executablePath: process.env.CHROME });
  const shots = process.env.E2E_SHOTS || '/tmp/hampton-shots'; mkdirSync(shots, { recursive: true });
  try {
    for (const width of [1280, 390]) {
      // A synthetic chat whose email is the seed's fictitious Sarah Vibert (contact 1).
      d1(`INSERT INTO chats (key_hash, name, email, privacy_ack_at, created_at, last_at, waiting_since) VALUES ('e2e-msg03-${width}',
        'Synthetic Visitor ${width}', 'sarah.vibert@example.je', '2026-11-16T09:00:00.000Z', strftime('%Y-%m-%dT%H:%M:%fZ','now'),
        strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now'))`);
      const id = d1(`SELECT id FROM chats WHERE key_hash = 'e2e-msg03-${width}'`)[0].id;
      d1(`INSERT INTO chat_messages (chat_id, role, text, created_at) VALUES (${id}, 'visitor', 'Is the flat still free?', strftime('%Y-%m-%dT%H:%M:%fZ','now'))`);

      const ctx = await browser.newContext({ viewport: { width, height: 900 }, timezoneId: 'Europe/Jersey', reducedMotion: 'reduce' });
      await ctx.addCookies([{ name: COOKIE, value: await signSession('admin@example.test', vars.SESSION_SECRET),
        domain: new URL(BASE).hostname, path: '/', httpOnly: true, secure: true, sameSite: 'Strict' }]);
      const page = await ctx.newPage(), errors = [];
      page.on('pageerror', e => errors.push(e.message));
      await page.route('https://fonts.googleapis.com/**', route => route.fulfill({ status: 200, contentType: 'text/css', body: '' }));
      page.setDefaultTimeout(15000);
      const fits = () => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1);

      // Opened from a link, among All. Nothing is linked: the same email is only a suggestion.
      await page.goto(new URL(`admin/#/messages?chat=${id}`, BASE).href);
      await page.locator('#c-title', { hasText: `Synthetic Visitor ${width}` }).waitFor();
      const card = page.locator(`section[aria-labelledby="cc-${id}"]`);
      await card.getByText('Not linked to a contact. Nothing is linked automatically.').waitFor();
      const suggested = card.getByRole('list', { name: 'Suggested contacts' });
      await suggested.getByRole('link', { name: 'Sarah Vibert' }).waitFor();
      assert.equal(linkedTo(id), null, 'a suggestion links nothing');
      if (width === 1280) await card.screenshot({ path: join(shots, `msg03-suggestion-${width}.png`) }).catch(() => {});

      await suggested.getByRole('button', { name: 'Link to Sarah Vibert' }).click();
      await card.getByRole('status').getByText('Chat linked to Sarah Vibert.').waitFor();
      await card.locator('p', { hasText: /^Linked to Sarah Vibert/ }).waitFor();
      assert.equal(linkedTo(id), 1);

      // A panel that still shows the older link is refused.
      const stale = await page.evaluate(async id => {
        const r = await fetch(`/api/admin/chats/${id}/contact`, { method: 'POST', credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contact_id: 2, version: 0 }) });
        return r.status;
      }, id);
      assert.equal(stale, 409);
      assert.equal(linkedTo(id), 1);

      // The search announces its result; the linked contact alone is no match.
      const search = async q => { await card.getByLabel('Find a contact').fill(q); await card.getByRole('button', { name: 'Search' }).click(); };
      await search('Vibert');
      await card.getByRole('status').getByText('No contact matches. To add one, use Review chat contact.').waitFor();
      assert.equal(await card.getByRole('list', { name: 'Contacts found' }).count(), 0, 'no empty list');
      // A Jersey-format phone finds another contact; linking moves the chat.
      await search('07700 900321');
      await card.getByRole('status').getByText('1 contact found', { exact: true }).waitFor();
      const found = card.getByRole('list', { name: 'Contacts found' });
      await found.getByRole('button', { name: 'Link to Tom Renouf' }).click();
      await card.getByRole('status').getByText('Chat linked to Tom Renouf.').waitFor();
      assert.equal(linkedTo(id), 2);
      assert.ok(await fits(), 'Messages fits');
      await page.screenshot({ path: join(shots, `msg03-linked-${width}.png`), fullPage: true }).catch(() => {});
      const events = d1(`SELECT entity_id, type FROM events WHERE type LIKE 'contact.chat_%' AND json_extract(data, '$.chat_id') = ${id} ORDER BY id`);
      assert.deepEqual(events.map(e => [e.entity_id, e.type]), [['1', 'contact.chat_linked'], ['1', 'contact.chat_unlinked'], ['2', 'contact.chat_linked']]);

      // The contact's record lists the chat and opens it in Messages.
      await card.getByRole('link', { name: 'Tom Renouf' }).click();
      await page.getByRole('tab', { name: 'Messages' }).click(); // SAP-08: the record's Messages tab
      const chats = page.locator('section[aria-labelledby="h-contact-chats"]');
      await chats.waitFor();
      assert.ok(await fits(), 'the record fits');
      await page.screenshot({ path: join(shots, `msg03-record-${width}.png`), fullPage: true }).catch(() => {});
      const open = chats.locator(`a[href="#/messages?chat=${id}"]`);
      await open.focus();
      await page.keyboard.press('Enter');
      await page.locator('#c-title', { hasText: `Synthetic Visitor ${width}` }).waitFor();

      // Unlink: back to no contact, with a suggestion again.
      await card.getByRole('button', { name: 'Unlink' }).click();
      await card.getByRole('status').getByText('Chat unlinked from Tom Renouf.').waitFor();
      await card.getByText('Not linked to a contact. Nothing is linked automatically.').waitFor();
      assert.equal(linkedTo(id), null);
      if (width === 1280) {
        await page.evaluate(() => { document.documentElement.style.zoom = '2'; });
        assert.ok(await fits(), 'fits at 200% zoom');
      }
      assert.deepEqual(errors, []);
      await ctx.close();
    }
    console.log('MSG-03 contact link e2e passed at 1280 and 390 px.');
  } finally {
    await browser.close();
  }
})().catch(e => { console.error(e); process.exit(1); });
