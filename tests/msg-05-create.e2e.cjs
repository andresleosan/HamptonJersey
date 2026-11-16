// MSG-05: from Messages a person opens Create applicant on a website chat, edits the filled-in details and saves by
// hand; a double click creates one applicant and links the chat, a stale tab gets 409, a saved contact's email gets the
// usual offer, and a chat deleted before Save creates nothing. 1280 and 390 px, synthetic data only.
// Run only through test:e2e:isolated with the local fixture (MSG05_CREATE_READY on in tests/run-e2e.cjs).
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
  assert.equal(vars.MSG05_CREATE_READY, '1');
  const { signSession, COOKIE } = await import('../server/auth.js');
  const wrangler = join(dirname(require.resolve('wrangler')), '..', 'bin', 'wrangler.js');
  const d1 = command => JSON.parse(execFileSync(process.execPath, [wrangler, 'd1', 'execute', 'hampton', '--local',
    '--persist-to', process.env.E2E_PERSIST, '--json', '--command', command], { stdio: 'pipe' }))[0].results;
  const addChat = (tag, name, email) => {
    d1(`INSERT INTO chats (key_hash, name, email, privacy_ack_at, created_at, last_at, waiting_since) VALUES ('e2e-msg05-${tag}',
      '${name}', '${email}', '2026-11-16T09:00:00.000Z', strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now'),
      strftime('%Y-%m-%dT%H:%M:%fZ','now'))`);
    const id = d1(`SELECT id FROM chats WHERE key_hash = 'e2e-msg05-${tag}'`)[0].id;
    d1(`INSERT INTO chat_messages (chat_id, role, text, created_at) VALUES (${id}, 'visitor', 'Looking for a flat', strftime('%Y-%m-%dT%H:%M:%fZ','now'))`);
    return id;
  };
  const browser = await chromium.launch({ executablePath: process.env.CHROME });
  const shots = process.env.E2E_SHOTS || '/tmp/hampton-shots'; mkdirSync(shots, { recursive: true });
  try {
    for (const width of [1280, 390]) {
      const email = `chat-create-${width}@example.test`, id = addChat(`new-${width}`, `Synthetic Chat ${width}`, email);
      const ctx = await browser.newContext({ viewport: { width, height: 900 }, timezoneId: 'Europe/Jersey', reducedMotion: 'reduce' });
      await ctx.addCookies([{ name: COOKIE, value: await signSession('admin@example.test', vars.SESSION_SECRET),
        domain: new URL(BASE).hostname, path: '/', httpOnly: true, secure: true, sameSite: 'Strict' }]);
      const page = await ctx.newPage(), errors = [], posts = [];
      page.on('pageerror', e => errors.push(e.message));
      page.on('request', r => { if (r.method() === 'POST' && /\/api\/admin\/(chats\/\d+\/applicant|applicants)$/.test(new URL(r.url()).pathname)) posts.push(new URL(r.url()).pathname); });
      await page.route('https://fonts.googleapis.com/**', route => route.fulfill({ status: 200, contentType: 'text/css', body: '' }));
      page.setDefaultTimeout(15000);
      const fits = () => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1);
      const fill = async ({ source = 'email', operation = 'rent' } = {}) => {
        await page.locator(`input[name="n-source"][value="${source}"]`).check();
        await page.locator(`input[name="a-operation"][value="${operation}"]`).check();
        await page.locator('input[name="a-area_answer"][value="unknown"]').check();
      };

      // Messages offers Create applicant; it opens the form with the chat's details, editable, nothing ticked.
      await page.goto(new URL(`admin/#/messages?chat=${id}`, BASE).href);
      await page.locator('#c-title', { hasText: `Synthetic Chat ${width}` }).waitFor();
      await page.getByRole('link', { name: 'Create applicant', exact: true }).focus();
      await page.keyboard.press('Enter');
      await page.getByRole('heading', { name: 'Create applicant from chat', exact: true }).waitFor();
      await page.getByRole('status').filter({ hasText: 'Nothing is created until you press Save applicant.' }).waitFor();
      assert.equal(new URL(page.url()).hash, `#/applicants/new?chat=${id}`, 'only the chat id in the address');
      assert.equal(await page.locator('#a-name').inputValue(), `Synthetic Chat ${width}`);
      assert.equal(await page.locator('#a-email').inputValue(), email);
      assert.equal(await page.locator('#a-name').isEnabled(), true);
      assert.equal(await page.getByLabel('They were told how we use their details and accept the privacy notice').isChecked(), false);
      assert.equal(await page.locator('input[name="n-source"]:checked').count(), 0);
      const storage = await page.evaluate(() => JSON.stringify({ ...localStorage, ...sessionStorage }));
      assert.ok(!storage.includes(email), 'no contact details in browser storage');
      assert.equal(d1(`SELECT COUNT(*) n FROM contacts WHERE email = '${email}'`)[0].n, 0, 'opening creates nothing');

      // Save without the required answers: refused in the form, nothing sent.
      await page.getByRole('button', { name: 'Save applicant' }).click();
      await page.getByRole('alert').filter({ hasText: 'Please check the highlighted field.' }).waitFor();
      assert.deepEqual(posts, []);

      // Edited and saved with a double click: one applicant, the chat linked to it.
      await page.locator('#a-name').fill(`Synthetic Edited ${width}`);
      await fill();
      await page.getByLabel('They were told how we use their details and accept the privacy notice').check();
      if (width === 1280) await page.screenshot({ path: join(shots, `msg05-create-${width}.png`), fullPage: true }).catch(() => {});
      assert.ok(await fits(), 'the form fits');
      await page.getByRole('button', { name: 'Save applicant' }).dblclick();
      await page.waitForFunction(() => /^#\/applicants\/\d+$/.test(location.hash));
      const applicantId = Number(new URL(page.url()).hash.split('/').pop());
      const saved = d1(`SELECT a.id, a.contact_id, c.name FROM applicants a JOIN contacts c ON c.id = a.contact_id WHERE c.email = '${email}'`);
      assert.equal(saved.length, 1, 'one applicant for a double click');
      assert.deepEqual([saved[0].id, saved[0].name], [applicantId, `Synthetic Edited ${width}`]);
      assert.deepEqual(d1(`SELECT contact_id, contact_version FROM chats WHERE id = ${id}`)[0], { contact_id: saved[0].contact_id, contact_version: 1 });
      assert.equal(d1(`SELECT COUNT(*) n FROM chat_applicant_saves WHERE chat_id = ${id}`)[0].n, 1);
      assert.ok(posts.length >= 1 && posts.every(p => p === `/api/admin/chats/${id}/applicant`), 'only the chat route');

      // A tab still on the old version is refused.
      const stale = await page.evaluate(async id => (await fetch(`/api/admin/chats/${id}/applicant`, { method: 'POST',
        credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ version: 0,
          operation_key: 'e2e-stale-key-000001', name: 'Other', email: 'other-stale@example.test', source: 'email', operation: 'buy',
          area_answer: 'any' }) })).status, id);
      assert.equal(stale, 409);
      assert.equal(d1("SELECT COUNT(*) n FROM contacts WHERE email = 'other-stale@example.test'")[0].n, 0);

      if (width === 1280) {
        // The email of a saved contact: the usual offer, then a new search for that contact; the chat is linked to it.
        const dup = addChat('dup', 'Synthetic Duplicate', 'sarah.vibert@example.je');
        await page.goto(new URL(`admin/#/applicants/new?chat=${dup}`, BASE).href);
        await page.getByRole('heading', { name: 'Create applicant from chat', exact: true }).waitFor();
        await fill({ operation: 'buy' });
        await page.getByRole('button', { name: 'Save applicant' }).click();
        await page.getByRole('alert').filter({ hasText: 'Sarah Vibert is already a contact' }).waitFor();
        assert.equal(await page.getByRole('button', { name: 'Save applicant' }).count(), 0, 'Save gives way to the offer');
        await page.getByRole('button', { name: 'Add a new search for this contact' }).click();
        await page.waitForFunction(() => /^#\/applicants\/\d+$/.test(location.hash));
        assert.equal(d1(`SELECT contact_id FROM chats WHERE id = ${dup}`)[0].contact_id, 1);
        assert.equal(d1("SELECT COUNT(*) n FROM contacts WHERE email = 'sarah.vibert@example.je'")[0].n, 1);

        // Saved, but the answer is lost: the version our own save raised does not block Save, and Save again with the same
        // key opens the applicant created the first time, without a second one.
        const lost = addChat('lost', 'Synthetic Lost', 'chat-lost@example.test');
        await page.goto(new URL(`admin/#/applicants/new?chat=${lost}`, BASE).href);
        await page.getByRole('heading', { name: 'Create applicant from chat', exact: true }).waitFor();
        await fill();
        await page.route(`**/api/admin/chats/${lost}/applicant`, async route => { await route.fetch(); await route.abort(); }, { times: 1 });
        await page.getByRole('button', { name: 'Save applicant' }).click();
        await page.getByRole('alert').filter({ hasText: "Can't reach the server" }).waitFor();
        const first = d1("SELECT a.id FROM applicants a JOIN contacts c ON c.id = a.contact_id WHERE c.email = 'chat-lost@example.test'");
        assert.equal(first.length, 1, 'the first save was committed');
        await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
        await page.getByRole('alert').filter({ hasText: 'Save again to check whether your applicant was saved.' }).waitFor();
        assert.equal(await page.getByText('Nothing was saved').count(), 0);
        assert.equal(await page.getByRole('button', { name: 'Save applicant' }).isEnabled(), true);
        await page.getByRole('button', { name: 'Save applicant' }).click();
        await page.waitForFunction(() => /^#\/applicants\/\d+$/.test(location.hash));
        assert.equal(Number(new URL(page.url()).hash.split('/').pop()), first[0].id);
        assert.equal(d1("SELECT COUNT(*) n FROM contacts WHERE email = 'chat-lost@example.test'")[0].n, 1);

        // A chat deleted while the form is open: Save says so and creates nothing.
        const gone = addChat('gone', 'Synthetic Gone', 'chat-gone@example.test');
        await page.goto(new URL(`admin/#/applicants/new?chat=${gone}`, BASE).href);
        await page.getByRole('heading', { name: 'Create applicant from chat', exact: true }).waitFor();
        await fill();
        d1(`DELETE FROM chats WHERE id = ${gone}`);
        await page.getByRole('button', { name: 'Save applicant' }).click();
        await page.getByRole('alert').filter({ hasText: 'This chat was deleted. Nothing was saved.' }).waitFor();
        assert.equal(await page.getByRole('button', { name: 'Save applicant' }).isDisabled(), true);
        assert.equal(d1("SELECT COUNT(*) n FROM contacts WHERE email = 'chat-gone@example.test'")[0].n, 0);
        await page.evaluate(() => { document.documentElement.style.zoom = '2'; });
        assert.ok(await fits(), 'fits at 200% zoom');
      }
      assert.deepEqual(errors, []);
      await ctx.close();
    }
    console.log('MSG-05 create applicant from chat e2e passed at 1280 and 390 px.');
  } finally {
    await browser.close();
  }
})().catch(e => { console.error(e); process.exit(1); });
