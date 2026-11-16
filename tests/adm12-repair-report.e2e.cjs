// Isolated local fixtures only: E2E_PRODUCTION_READONLY=0 E2E_SCRIPT=tests/adm12-repair-report.e2e.cjs npm run test:e2e:isolated
// ADM-12 (Tareas 1 and 3): the team creates a tenant repair link with its last day, copies it and records sending it; the
// tenant opens it, asks for a code, enters it and reports a repair, which arrives as Reported; a revocation closes it.
// The fixture has no email binding (as production until AUT-17): asking for a code answers "can't send" for real. To
// walk on, the code's email is replaced by a challenge this test writes with the run's key, and the browser's request
// for a code is answered with that challenge's id. Checking the code and reporting run against the real server.
const assert = require('node:assert/strict');
const { readFileSync, mkdirSync } = require('node:fs');
const { join, dirname } = require('node:path');
const { parseEnv } = require('node:util');
const { randomUUID } = require('node:crypto');
const { execFileSync } = require('node:child_process');
const { chromium, webkit } = require(process.env.PW || 'playwright-core');
(async () => {
  assert.equal(process.env.HAMPTON_E2E_ISOLATED, '1'); assert.equal(process.env.E2E_PRODUCTION_READONLY, '0');
  const vars = parseEnv(readFileSync(process.env.E2E_VARS, 'utf8')), { signSession, COOKIE } = await import('../server/auth.js');
  const { challengeDigest, keyId } = await import('../server/case-access-crypto.js');
  const { jerseyToday, plusDays } = await import('../server/viewings.js');
  assert.equal(vars.ADM12_CASE_ACCESS_READY, '1'); assert.ok(vars.CASE_CHALLENGE_HMAC_KEY.length >= 32);
  const base = process.env.BASE.replace('127.0.0.1', 'localhost'), origin = new URL(base).origin, ADMIN = 'admin@example.test';
  const shots = process.env.E2E_SHOTS; if (shots) mkdirSync(shots, { recursive: true });
  const wrangler = join(dirname(require.resolve('wrangler')), '..', 'bin', 'wrangler.js');
  const d1 = sql => JSON.parse(execFileSync(process.execPath, [wrangler, 'd1', 'execute', 'hampton', '--local', '--persist-to', process.env.E2E_PERSIST,
    '--json', '--command', sql], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })).at(-1).results;
  const at = '2000-01-01T00:00:00.000Z';
  d1(`INSERT INTO case_purpose_policies (purpose, revision, status, retention_ref, privacy_ref, approval_ref, approved_by, valid_from)
    VALUES ('repair_report', 1, 'approved', 'e2e-retention', 'e2e-privacy', 'e2e-policy', 'e2e-operator', '${at}')`);
  const browser = await (process.env.HAMPTON_E2E_BROWSER === 'webkit' ? webkit : chromium).launch({ executablePath: process.env.CHROME });
  try {
    const errors = [], thirdParty = [];
    for (const width of [1280, 390]) {
      console.log('ADM12 repair report width', width);
      const ctx = await browser.newContext({ viewport: { width, height: 900 }, timezoneId: 'Europe/Jersey', reducedMotion: 'reduce' });
      await ctx.addCookies([{ name: COOKIE, value: await signSession(ADMIN, vars.SESSION_SECRET), domain: new URL(base).hostname, path: '/',
        httpOnly: true, secure: true, sameSite: 'Strict' }]);
      await ctx.route('https://fonts.googleapis.com/**', route => route.fulfill({ status: 200, contentType: 'text/css', body: '' }));
      const post = async (path, data) => { const r = await ctx.request.post(base + 'api' + path, { headers: { origin }, data });
        assert.ok(r.ok(), await r.text()); return r.json(); };
      const owner = await post('/admin/landlords', { name: `ADM12 link owner ${width}` });
      const address = `${width} Synthetic Repair Lane`;
      const rid = (await post('/admin/rentals', { landlord_id: owner.landlord.id, address, parish: 'St Helier', service: 'let_only' })).rental.id;
      d1(`INSERT INTO tenancies (rental_id, tenant_name, tenant_email, kind, regime, start_on, rent, due_day, created_at, updated_at)
        VALUES (${rid}, 'Synthetic tenant ${width}', 'adm12-tenant-${width}@example.test', 'periodic', '2025', '2025-01-01', 1000, 1, '${at}', '${at}')`);
      const tid = d1(`SELECT id FROM tenancies WHERE rental_id = ${rid}`)[0].id;
      d1(`INSERT INTO case_capability_memberships (case_kind, case_id, staff_email, status, version, approval_ref, approved_by, approved_at,
        lifecycle_generation) VALUES ('tenancy', ${tid}, '${ADMIN}', 'active', 1, 'e2e-member', 'e2e-operator', '${at}', 1);
        INSERT INTO case_capability_grants (id, case_kind, case_id, staff_email, capability, purpose, status, version, membership_version,
        policy_revision, approval_ref, approved_by, valid_from) VALUES ('e2e-${tid}', 'tenancy', ${tid}, '${ADMIN}', 'case_data_write',
        'repair_report', 'active', 1, 1, 1, 'e2e-grant', 'e2e-operator', '${at}')`);

      const page = await ctx.newPage(); page.on('pageerror', e => errors.push(e.message)); page.setDefaultTimeout(15000);
      const text = async where => (await where.innerText()).replace(/\s+/g, ' ').trim();
      const says = async (where, label, expected) => {
        const ok = async () => { if (await where.count() !== 1) return false; const t = await text(where); return expected.every(p => t.includes(p)); };
        for (let i = 0; i < 80 && !(await ok()); i++) await where.page().waitForTimeout(100);
        assert.ok(await ok(), `${label}: "${await where.count() === 1 ? await text(where) : `${await where.count()} elements`}" should include ${JSON.stringify(expected)}`);
      };
      const fits = async (p, where) => assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1),
        `no sideways scroll: ${where} at ${width}`);
      await page.goto(base + `admin/#/rentals/${rid}`);
      const card = page.locator(`#repair-links-${tid}`);
      await says(card, 'card', ['Tenant repair link', 'A private link where the tenant reports a repair']);
      // The last day is required: no default.
      await card.getByRole('button', { name: 'Create repair link' }).click();
      await says(card.getByRole('alert'), 'date needed', ['Choose the last day the link works.']);
      const until = plusDays(jerseyToday(), 7);
      await card.getByLabel('Works until (last day)').fill(until);
      await card.getByRole('button', { name: 'Create repair link' }).click();
      const box = card.getByLabel('New repair link · shown only now'); await box.waitFor();
      const link = await box.inputValue();
      assert.match(link, /\/repair-report#[A-Za-z0-9_-]{43}$/);
      assert.equal(JSON.stringify(d1('SELECT * FROM case_grants')).includes(new URL(link).hash.slice(1)), false, 'only its hash is kept');
      await says(card, 'dormant', ['Not sent yet', 'It does not work until you record sending it.', '0 reports through it.']);
      await fits(page, 'panel');
      if (shots) await card.screenshot({ path: join(shots, `adm12-link-panel-${width}.png`) });

      // The tenant, in another profile. Opening the page sends nothing; the token leaves the address bar.
      const guest = await browser.newContext({ viewport: { width, height: 900 }, timezoneId: 'Europe/Jersey' }), client = await guest.newPage();
      client.on('pageerror', e => errors.push(e.message)); client.setDefaultTimeout(15000);
      client.on('request', r => { if (new URL(r.url()).origin !== origin) thirdParty.push(r.url()); });
      const res = await client.goto(link);
      assert.equal(res.headers()['cache-control'], 'no-store'); assert.equal(res.headers()['x-robots-tag'], 'noindex');
      assert.equal(res.headers()['referrer-policy'], 'no-referrer');
      assert.equal(new URL(client.url()).hash, '');
      const main = client.locator('main');
      await says(main, 'ask', ['Report a repair', 'we will email a 6-digit code']);
      assert.equal(d1(`SELECT COUNT(*) AS n FROM case_challenges c JOIN case_grants g ON g.id = c.grant_id WHERE g.case_id = ${tid}`)[0].n, 0);
      // No email service in this fixture, as in production until AUT-17: said plainly, nothing written.
      await main.getByRole('button', { name: 'Email me a code' }).click();
      await says(main.getByRole('alert'), 'no email yet', ["We can't send a code right now."]);
      await card.getByRole('button', { name: 'I have sent it' }).click();
      await says(card, 'sent', ['Working', `Sent by ${ADMIN}`]);

      // The email's stand-in: a challenge written with this run's key; the browser's request for a code gets its id.
      const grant = d1(`SELECT id FROM case_grants WHERE case_id = ${tid}`)[0].id, challenge = randomUUID(), code = String(100000 + width);
      const key = vars.CASE_CHALLENGE_HMAC_KEY, now = new Date(), expires = new Date(now.getTime() + 10 * 60e3).toISOString();
      d1(`INSERT INTO case_challenges (id, grant_id, digest, key_id, created_at, expires_at) VALUES ('${challenge}', '${grant}',
        '${await challengeDigest(key, challenge, grant, code)}', '${await keyId(key)}', '${now.toISOString()}', '${expires}')`);
      await client.route('**/api/case-access/challenge', route => route.fulfill({ status: 202, contentType: 'application/json',
        body: JSON.stringify({ challenge_id: challenge, expires_at: expires }) }));
      await main.getByRole('button', { name: 'Email me a code' }).click();
      const input = main.getByLabel('6-digit code'); await input.waitFor();
      assert.equal(await input.evaluate(e => e === document.activeElement), true, 'focus on the code');
      assert.equal(await input.getAttribute('autocomplete'), 'one-time-code'); assert.equal(await input.getAttribute('inputmode'), 'numeric');
      await input.fill('000000'); await client.keyboard.press('Enter');
      await says(main.getByRole('alert'), 'wrong code', ['That code is not right.']);
      assert.equal(await input.getAttribute('aria-invalid'), 'true');
      await input.fill(code); await main.getByRole('button', { name: 'Check code' }).click();
      await says(main, 'form', ['Your home:', address, 'WHAT NEEDS REPAIRING?', 'HOW URGENT IS IT?', 'Please do not send photos here.',
        'You can send 10 more reports today with this link.']);
      assert.equal(await main.locator('input[type=file]').count(), 0);
      await fits(client, 'form');
      if (shots) await client.screenshot({ path: join(shots, `adm12-form-${width}.png`), fullPage: true });

      // The form checks itself first; then one report, by keyboard where it matters.
      await main.getByRole('button', { name: 'Send report' }).click();
      await says(main.getByRole('alert'), 'title needed', ['Say what needs repairing.']);
      await main.getByLabel('What needs repairing?').fill(`Boiler not working ${width}`);
      await main.getByLabel('Describe the problem (optional)').fill('No hot water since yesterday evening.');
      await main.getByRole('button', { name: 'Send report' }).click();
      await says(main.getByRole('alert'), 'urgency needed', ['Choose how urgent it is.']);
      await main.getByRole('radio', { name: /^Urgent/ }).focus(); await client.keyboard.press('Space');
      await main.getByRole('button', { name: 'Send report' }).click();
      await says(main, 'received', ['Thank you. Your report has been received.', 'Reference', 'no work has been ordered yet']);
      assert.deepEqual(d1(`SELECT title, urgency, status, approved_at, created_by FROM repairs WHERE rental_id = ${rid}`),
        [{ title: `Boiler not working ${width}`, urgency: 'urgent', status: 'reported', approved_at: null, created_by: 'tenant' }]);
      assert.deepEqual(await client.evaluate(() => [localStorage.length, sessionStorage.length]), [0, 0]);
      if (shots) await client.screenshot({ path: join(shots, `adm12-received-${width}.png`), fullPage: true });
      const session = () => client.evaluate(() => fetch('/api/repair-report', { cache: 'no-store' }).then(r => r.status));

      // The same browser opens a link again (a shared computer): the session it had ends and the link asks for its own code.
      await client.goto('about:blank'); await client.goto(link);
      await says(main, 'link again', ['we will email a 6-digit code']);
      assert.equal(await session(), 404, 'the earlier session was ended');
      // A new code (the email's stand-in again), the form, then Sign out ends the session.
      const second = randomUUID(), code2 = String(200000 + width), now2 = new Date();
      d1(`INSERT INTO case_challenges (id, grant_id, digest, key_id, created_at, expires_at) VALUES ('${second}', '${grant}',
        '${await challengeDigest(key, second, grant, code2)}', '${await keyId(key)}', '${now2.toISOString()}', '${expires}')`);
      await client.unroute('**/api/case-access/challenge');
      await client.route('**/api/case-access/challenge', route => route.fulfill({ status: 202, contentType: 'application/json',
        body: JSON.stringify({ challenge_id: second, expires_at: expires }) }));
      await main.getByRole('button', { name: 'Email me a code' }).click();
      await main.getByLabel('6-digit code').fill(code2); await main.getByRole('button', { name: 'Check code' }).click();
      await says(main, 'form again', ['Your home:', address, 'You can send 9 more reports today with this link.']);
      await main.getByRole('button', { name: 'Sign out' }).click();
      await says(main, 'signed out', ['You have signed out.']);
      assert.equal(await session(), 404, 'signed out');

      // The team sees it in Repairs as reported by the tenant, then revokes the link: the tenant's session ends.
      await page.reload();
      await says(page.locator('#repairs'), 'repair', [`Boiler not working ${width}`, 'Reported by the tenant', 'Reported']);
      await says(card, 'counted', ['1 report through it.']);
      await card.getByRole('button', { name: 'Revoke link' }).click();
      await says(card, 'revoked', ['Revoked', `Revoked by ${ADMIN}`]);
      await client.reload();
      await says(main, 'closed', ['Open the link Hampton Estates sent you again to report a repair.']);
      await fits(client, 'closed');
      await guest.close(); await ctx.close();
    }
    assert.deepEqual(errors, []);
    assert.deepEqual(thirdParty, []);
    console.log('ADM12 repair report e2e passed');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
