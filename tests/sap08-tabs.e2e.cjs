// SAP-08: the applicant record's Messages and Viewings tabs. Viewings shows only the viewings with the contact's email or
// phone, marked "Matched by email/phone", without the requester's details; a failed read says so and Try again reads
// again. Messages lists only the website chats linked to this contact, and says email is not linked yet. Keyboard tabs,
// 1280 and 390 px, 200% zoom. Run only through test:e2e:isolated with the synthetic local fixture.
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
  const NOW = "strftime('%Y-%m-%dT%H:%M:%fZ','now')";
  // Tom Renouf (contact 2, search 2) already has seed viewing 1 (same email and phone). One more by phone alone, under
  // another name, and a chat linked to him; Sarah Vibert (contact 1) gets a chat of her own that must not show on Tom.
  d1(`INSERT INTO viewing_requests (listing_id, listing_ref, listing_title_snapshot, kind, date, time, end_time, name, email, phone,
    status, created_at) VALUES ('HE-R002', 'HE-R002', 'Trinity rental', 'In person', date('now','-6 days'), '09:00', '09:30',
    'Synthetic Requester', 'synthetic.other@example.je', '(07700) 900-321', 'completed', ${NOW})`);
  const chat = (key, contact) => {
    d1(`INSERT INTO chats (key_hash, name, email, privacy_ack_at, created_at, last_at, waiting_since, contact_id, contact_version)
      VALUES ('${key}', 'Synthetic Visitor', 'synthetic.visitor@example.je', ${NOW}, ${NOW}, ${NOW}, ${NOW}, ${contact}, 1)`);
    return d1(`SELECT id FROM chats WHERE key_hash = '${key}'`)[0].id;
  };
  const toms = chat('e2e-sap08-tom', 2), sarahs = chat('e2e-sap08-sarah', 1);

  const browser = await chromium.launch({ executablePath: process.env.CHROME });
  const shots = process.env.E2E_SHOTS || '/tmp/hampton-shots'; mkdirSync(shots, { recursive: true });
  try {
    for (const width of [1280, 390]) {
      const ctx = await browser.newContext({ viewport: { width, height: 900 }, timezoneId: 'Europe/Jersey', reducedMotion: 'reduce' });
      await ctx.addCookies([{ name: COOKIE, value: await signSession('admin@example.test', vars.SESSION_SECRET),
        domain: new URL(BASE).hostname, path: '/', httpOnly: true, secure: true, sameSite: 'Strict' }]);
      const page = await ctx.newPage(), errors = [];
      page.on('pageerror', e => errors.push(e.message));
      await page.route('https://fonts.googleapis.com/**', route => route.fulfill({ status: 200, contentType: 'text/css', body: '' }));
      // The first Viewings read fails: the tab must say so, not show "none".
      let failed = 0;
      await page.route('**/api/admin/applicants/2/viewings', route => (failed++ ? route.continue()
        : route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'Server error. Please try again.' }) })));
      page.setDefaultTimeout(15000);
      const fits = () => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1);

      await page.goto(new URL('admin/#/applicants/2/timeline', BASE).href);
      const tabs = page.getByRole('tablist', { name: 'Applicant record' });
      await tabs.getByRole('tab', { name: 'Timeline', selected: true }).waitFor();
      assert.deepEqual(await tabs.getByRole('tab').allInnerTexts(),
        ['Requirements', 'Matches', 'Offers', 'Timeline', 'Messages', 'Viewings']);

      // Keyboard: the arrow moves to Messages, which reads its chats.
      await tabs.getByRole('tab', { name: 'Timeline' }).focus();
      await page.keyboard.press('ArrowRight');
      await tabs.getByRole('tab', { name: 'Messages', selected: true }).waitFor();
      assert.equal(await page.evaluate(() => document.activeElement?.id), 'tab-messages');
      assert.match(page.url(), /#\/applicants\/2\/messages$/);
      const messages = page.locator('#panel-messages');
      await messages.locator(`a[href="#/messages?chat=${toms}"]`).waitFor();
      assert.equal(await messages.locator(`a[href="#/messages?chat=${sarahs}"]`).count(), 0, "another contact's chat");
      await messages.getByText('Email conversations are not linked to applicants yet.').waitFor();
      assert.ok(await fits(), 'Messages fits');
      await page.screenshot({ path: join(shots, `sap08-messages-${width}.png`), fullPage: true }).catch(() => {});

      // End jumps to Viewings: the failed read is an error with Try again, then the list.
      await page.keyboard.press('End');
      await tabs.getByRole('tab', { name: 'Viewings', selected: true }).waitFor();
      const viewings = page.locator('#panel-viewings');
      await viewings.getByRole('alert').getByText('Server error. Please try again.').waitFor();
      assert.equal(await viewings.getByText('No viewings with').count(), 0, 'an error is not "none"');
      await viewings.getByRole('button', { name: 'Try again' }).click();
      await viewings.getByText('Matched by email/phone', { exact: true }).waitFor();
      const items = viewings.locator('ol.timeline > li');
      assert.equal(await items.count(), 2);
      await items.filter({ hasText: 'Le Bernage' }).getByText('Same email and phone').waitFor();
      await items.filter({ hasText: 'Trinity rental' }).getByText('Same phone', { exact: true }).waitFor();
      await items.filter({ hasText: 'Trinity rental' }).getByText('Completed').waitFor();
      const text = await viewings.innerText();
      for (const other of ['Synthetic Requester', 'synthetic.other@example.je', 'Paul Le Feuvre', 'Café and Accommodation'])
        assert.ok(!text.includes(other), `no ${other}`);
      assert.ok(await fits(), 'Viewings fits');
      await page.screenshot({ path: join(shots, `sap08-viewings-${width}.png`), fullPage: true }).catch(() => {});
      // Back restores the tab it came from.
      await page.goBack();
      await tabs.getByRole('tab', { name: 'Messages', selected: true }).waitFor();
      if (width === 1280) {
        await page.evaluate(() => { document.documentElement.style.zoom = '2'; });
        assert.ok(await fits(), 'fits at 200% zoom');
      }
      assert.deepEqual(errors, []);
      await ctx.close();
    }
    console.log('SAP-08 Messages and Viewings tabs e2e passed at 1280 and 390 px.');
  } finally {
    await browser.close();
  }
})().catch(e => { console.error(e); process.exit(1); });
