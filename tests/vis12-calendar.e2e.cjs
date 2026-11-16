// VIS-12: a negotiator's Google Calendar in the panel. Connect and Disconnect in Availability, a time busy in Google
// refused on Confirm, "I checked the calendar myself" after Google could not be checked, and the viewing's calendar
// state. Local fixture only, synthetic data, VIS12_CALENDAR_READY=1 and a fake Google on localhost:8797 (no network:
// tests/run-e2e.cjs points GOOGLE_OAUTH_URL and GOOGLE_CALENDAR_API at it; Google's sign-in page is intercepted).
const { chromium } = require(process.env.PW || 'playwright-core');
const assert = require('node:assert/strict');
const http = require('node:http');
const { readFileSync, mkdirSync } = require('node:fs');
const { parseEnv } = require('node:util');
const { execFileSync } = require('node:child_process');
const { join, dirname } = require('node:path');
const BASE = process.env.BASE, vars = parseEnv(readFileSync(process.env.E2E_VARS, 'utf8'));
const wrangler = join(dirname(require.resolve('wrangler')), '..', 'bin', 'wrangler.js');
const sql = statement => execFileSync(process.execPath, [wrangler, 'd1', 'execute', 'hampton', '--local',
  '--persist-to', process.env.E2E_PERSIST, '--command', statement], { stdio: 'pipe' });
const NOTE = 'Ring the bell twice FIXTURE-NOTE';

// The fake Google of the server tests, behind a local HTTP port; /__control sets its busy times and failures.
async function startGoogle() {
  const { fakeGoogle } = await import('./server/google-calendar-fake.mjs');
  const g = fakeGoogle();
  const server = http.createServer(async (req, res) => {
    const chunks = []; for await (const c of req) chunks.push(c);
    const body = Buffer.concat(chunks).toString();
    if (req.url === '/__control') {
      const c = JSON.parse(body || '{}');
      if ('busy' in c) g.busy = c.busy;
      if ('fail' in c) g.fail = c.fail;
      return res.end('{}');
    }
    const real = (/^\/(token|revoke)/.test(req.url) ? 'https://oauth2.googleapis.com' : 'https://www.googleapis.com') + req.url;
    const headers = Object.fromEntries(Object.entries(req.headers).filter(([k]) => !['host', 'content-length', 'connection'].includes(k)));
    try {
      const r = await g.fetch(real, { method: req.method, headers, body: body || undefined });
      res.writeHead(r.status, { 'content-type': 'application/json' });
      res.end(await r.text());
    } catch { res.destroy(); }
  });
  await new Promise(ok => server.listen(8797, ok));
  return { g, close: () => new Promise(ok => server.close(ok)) };
}
const control = body => new Promise((ok, fail) => {
  const req = http.request('http://127.0.0.1:8797/__control', { method: 'POST' }, res => { res.resume(); res.on('end', ok); });
  req.on('error', fail); req.end(JSON.stringify(body));
});

(async () => {
  assert.ok(BASE && process.env.E2E_PERSIST, 'isolated local fixture required');
  assert.equal(vars.VIS12_CALENDAR_READY, '1');
  const { signSession, COOKIE } = await import('../server/auth.js');
  const { jerseyToday, plusDays } = await import('../server/viewings.js');
  const date = plusDays(jerseyToday(), 2);
  const google = await startGoogle();
  const browser = await chromium.launch({ executablePath: process.env.CHROME });
  try { for (const [width, listing, negotiator, id] of [[1280, 'HE-R001', 'Gilberto Franco', 301], [390, 'HE-R002', 'Joshua Franco', 302]]) {
    const who = `Cal Applicant ${width}`;
    sql(`INSERT INTO viewing_requests (id, listing_id, listing_ref, listing_title_snapshot, agent, negotiator_id, kind, date, time, end_time,
      name, email, phone, notes, status, created_at) VALUES (${id}, '${listing}', '${listing}', 'Fixture', '${negotiator}',
      (SELECT id FROM negotiators WHERE name = '${negotiator}'), 'In person', '${date}', '11:00', '11:30', '${who}',
      'cal${width}@example.je', '07700 900${width}', '${NOTE}', 'requested', '2026-11-01T10:00:00.000Z')`);
    await control({ busy: [], fail: {} });

    const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce' });
    await context.addCookies([{ name: COOKIE, value: await signSession('admin@example.test', vars.SESSION_SECRET),
      domain: new URL(BASE).hostname, path: '/', secure: true, httpOnly: true, sameSite: 'Strict' }]);
    const page = await context.newPage(), errors = [];
    page.setDefaultTimeout(15000);
    page.on('dialog', d => d.accept());
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => {
      const offlineFonts = process.env.E2E_OFFLINE_FONTS === '1' && /^Failed to preconnect to https:\/\/fonts\./.test(message.text());
      if (message.type() === 'error' && !/Failed to load resource/i.test(message.text()) && !offlineFonts) errors.push(message.text());
    });
    let googleSignIn = null;
    await page.route('https://accounts.google.com/**', route => {
      googleSignIn = new URL(route.request().url());
      return route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>Google</title><p>Fake Google sign-in</p>' });
    });
    const shot = async (target, name) => {
      if (!process.env.E2E_SHOTS) return;
      mkdirSync(process.env.E2E_SHOTS, { recursive: true });
      await target.screenshot({ path: join(process.env.E2E_SHOTS, `vis12-${name}-${width}.png`) });
    };
    const stored = async () => (await page.evaluate(async path => (await fetch(path, { credentials: 'same-origin', cache: 'no-store' })).json(),
      `/api/admin/viewings/${id}`)).viewing;
    const record = page.locator('article.avail-detail'), gcal = record.locator('section[aria-labelledby="h-gcal"]');
    const pickNegotiator = async () => {
      await page.getByRole('list', { name: 'Negotiators' }).getByRole('button', { name: new RegExp(negotiator) }).click();
      await record.getByRole('heading', { name: negotiator, level: 2 }).waitFor();
    };
    const tall = async target => {
      const box = await target.boundingBox();
      assert.ok(box.height >= 32, `${width}px: target height ${box.height}`);
    };

    // Availability: not connected yet; Connect opens Google's sign-in with the fixed redirect and the two scopes.
    await page.goto(`${BASE}admin/#/availability`);
    await pickNegotiator();
    await gcal.getByText(`Not connected. ${negotiator}'s viewings stay in Hampton's calendar only.`).waitFor();
    const connect = gcal.getByRole('button', { name: 'Connect Google Calendar' });
    await tall(connect);
    await shot(record, 'not-connected');
    await connect.click();
    await page.waitForURL(/accounts\.google\.com/);
    // SITE_URL is wrangler.toml's: the redirect is the production one, never taken from the request.
    assert.equal(googleSignIn.searchParams.get('redirect_uri'), 'https://www.hamptonestatesjersey.com/api/calendar/google/callback');
    assert.deepEqual(googleSignIn.searchParams.get('scope').split(' '), ['https://www.googleapis.com/auth/calendar.events.owned',
      'https://www.googleapis.com/auth/calendar.freebusy']);
    // Google sends the browser back with a code and the state; the panel says so and the record shows it connected.
    await page.goto(`${BASE}api/calendar/google/callback?code=4%2FFIXTURE-CODE&state=${encodeURIComponent(googleSignIn.searchParams.get('state'))}`);
    await page.getByRole('status').filter({ hasText: 'Google Calendar connected.' }).waitFor();
    assert.equal(new URL(page.url()).search, '', 'the answer is taken off the address');
    await pickNegotiator();
    await gcal.getByText(`Connected. Confirmed viewings go into ${negotiator}'s Google Calendar`).waitFor();
    assert.ok(!(await page.content()).includes('FIXTURE-REFRESH'), 'the token never reaches the page');
    await shot(record, 'connected');

    // Viewings: a time busy in Google is refused, with no way round it.
    await control({ busy: [{ start: `${date}T00:00:00Z`, end: `${date}T23:59:00Z` }] });
    await page.goto(`${BASE}admin/#/viewings?listing=${listing}`);
    const open = page.locator('article.inbox-detail'), row = page.locator('.inbox-list li').filter({ hasText: who });
    await row.getByRole('button').click();
    await open.getByRole('heading', { name: new RegExp(who) }).waitFor();
    const confirmBtn = open.getByRole('button', { name: 'Confirm', exact: true });
    await confirmBtn.click();
    await open.getByRole('alert').filter({ hasText: 'The negotiator is busy at this time in Google Calendar. Please choose another.' }).waitFor();
    assert.equal(await open.getByLabel(/I checked the calendar myself/).count(), 0, 'a busy time gets no box');
    assert.equal((await stored()).status, 'requested');
    await shot(open, 'busy');

    // Google cannot be checked: still requested, until staff tick that they checked the calendar themselves.
    await control({ busy: [], fail: { freebusy: 503 } });
    await confirmBtn.click();
    await open.getByRole('alert').filter({ hasText: "The negotiator's Google Calendar could not be checked for this time." }).waitFor();
    const box = open.getByLabel(/I checked the calendar myself/);
    await box.waitFor();
    assert.equal((await stored()).status, 'requested');
    await box.focus();
    await page.keyboard.press('Space');
    assert.equal(await box.isChecked(), true, 'ticked with the keyboard');
    await tall(box.locator('xpath=..'));
    await shot(open, 'unchecked');
    const put = page.waitForResponse(r => r.request().method() === 'PUT' && new URL(r.url()).pathname === `/api/admin/viewings/${id}`);
    await confirmBtn.click();
    assert.equal((await put).status(), 200);
    await page.getByRole('status').filter({ hasText: "Confirmed. It's in Upcoming now." }).waitFor();
    assert.equal((await stored()).status, 'confirmed');

    // Upcoming: the viewing's event in the negotiator's calendar (written just after the answer).
    await page.getByRole('group', { name: 'Viewings' }).getByRole('button', { name: /^Upcoming/ }).click();
    await row.waitFor();
    await row.getByRole('button').click();
    await open.getByRole('heading', { name: new RegExp(who) }).waitFor();
    const fact = open.locator('dt').filter({ hasText: 'Google Calendar' }).locator('xpath=following-sibling::dd');
    for (let i = 0; i < 10 && !(await fact.textContent().catch(() => '')).includes('In the calendar'); i++) {
      const again = fact.getByRole('button', { name: 'Check again' });
      if (await again.count()) await again.click(); else await page.waitForTimeout(300);
      await page.waitForTimeout(300);
    }
    assert.match(await fact.textContent(), /^In the calendar/);
    const events = [...google.g.events.values()].filter(e => e.extendedProperties?.private?.hampton_viewing === String(id));
    assert.equal(events.length, 1, 'one event');
    assert.match(events[0].summary, /^Viewing: /);
    assert.equal(events[0].attendees, undefined, 'no invitation while its own switch is off');
    for (const secret of ['FIXTURE-NOTE', who, `cal${width}@example.je`, '07700'])
      assert.ok(!google.g.sent().includes(secret), `nothing private sent to Google: ${secret}`);
    await shot(open, 'in-calendar');
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'no horizontal scroll');

    // Disconnect: the token goes and Google is asked to revoke it.
    await page.goto(`${BASE}admin/#/availability`);
    await pickNegotiator();
    await gcal.getByRole('button', { name: 'Disconnect Google Calendar' }).click();
    await gcal.getByRole('status').filter({ hasText: `${negotiator}'s Google Calendar is disconnected.` }).waitFor();
    await gcal.getByText(`Not connected. ${negotiator}'s viewings stay in Hampton's calendar only.`).waitFor();
    for (let i = 0; i < 20 && !google.g.calls.some(c => c.url.includes('/revoke')); i++) await page.waitForTimeout(100);
    assert.ok(google.g.calls.some(c => c.url.includes('/revoke')), 'Google was asked to revoke the token');
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'no horizontal scroll');
    if (width === 1280) {
      await page.evaluate(() => { document.documentElement.style.zoom = '2'; });
      // At 200% the record's sections are already wider than its card (Weekly hours and Exceptions, before VIS-12):
      // the calendar section reflows to the same width as theirs, never wider.
      const wide = await page.evaluate(() => {
        const edge = document.getElementById('h-exc').getBoundingClientRect().right;
        return [...document.querySelectorAll('section[aria-labelledby="h-gcal"] *')].filter(e => e.getBoundingClientRect().right > edge + 1)
          .slice(0, 5).map(e => e.tagName);
      });
      assert.deepEqual(wide, [], `no wider than the record's other sections at 200%: ${wide}`);
      await page.evaluate(() => { document.documentElement.style.zoom = '1'; });
    }

    assert.deepEqual(errors, []);
    await context.close();
    google.g.calls.length = 0;
    console.log(`VIS-12 Google Calendar ${width}px: connect, busy refused, checked-myself confirm, event state, disconnect passed.`);
  } } finally { await browser.close(); await google.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
