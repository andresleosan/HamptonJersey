// VIS-14: houses with several open requests in Viewings: back-to-back times, an open viewing with places, its counts in
// the busy calendar without anyone's details, and cancelling it. Local fixture only, synthetic data, VIS14_BLOCK_READY=1.
const { chromium } = require(process.env.PW || 'playwright-core');
const assert = require('node:assert/strict');
const { readFileSync, mkdirSync } = require('node:fs');
const { parseEnv } = require('node:util');
const { execFileSync } = require('node:child_process');
const { join, dirname } = require('node:path');
const BASE = process.env.BASE, vars = parseEnv(readFileSync(process.env.E2E_VARS, 'utf8'));
const wrangler = join(dirname(require.resolve('wrangler')), '..', 'bin', 'wrangler.js');
const sql = statement => execFileSync(process.execPath, [wrangler, 'd1', 'execute', 'hampton', '--local',
  '--persist-to', process.env.E2E_PERSIST, '--command', statement], { stdio: 'pipe' });

(async () => {
  assert.ok(BASE && process.env.E2E_PERSIST, 'isolated local fixture required');
  const { signSession, COOKIE } = await import('../server/auth.js');
  const { jerseyToday, plusDays } = await import('../server/viewings.js');
  const today = jerseyToday();
  const browser = await chromium.launch({ executablePath: process.env.CHROME });
  try {
    // Signed out, the plans are not there to read or write.
    const anonymous = await browser.newContext({ ignoreHTTPSErrors: true }); // the fixture's own local certificate
    for (const [method, path] of [['GET', 'api/admin/viewing-groups'], ['POST', 'api/admin/viewing-groups/consecutive']]) {
      const r = await anonymous.request.fetch(`${BASE}${path}`, { method, headers: { origin: new URL(BASE).origin }, data: method === 'POST' ? {} : undefined });
      assert.equal(r.status(), 401, `${method} ${path} signed out`);
    }
    await anonymous.close();

    for (const [width, listing, first, nth] of [[1280, 'HE-R002', 300, 0], [390, 'HE-C001', 400, 1]]) {
      // Four website requests for this width's house, far ahead with Gilberto, so the plans below are free to move them.
      const names = ['Ana', 'Ben', 'Cai', 'Dee'].map(n => `${n} Block ${width}`), far = plusDays(today, 40 + nth);
      sql(`INSERT INTO viewing_requests (id, listing_id, listing_ref, listing_title_snapshot, agent, negotiator_id, kind, date, time,
        end_time, name, email, status, created_at) VALUES ${names.map((name, i) => `(${first + i},'${listing}','${listing}','Fixture',
        (SELECT name FROM negotiators WHERE id = 1),1,'In person','${far}','1${i}:00','1${i}:30','${name}',
        'block${first + i}@example.je','requested','2026-11-01T10:00:00.000Z')`).join(',')}`);
      const ids = names.map((_, i) => first + i);

      const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce' });
      await context.addCookies([{ name: COOKIE, value: await signSession('admin@example.test', vars.SESSION_SECRET),
        domain: new URL(BASE).hostname, path: '/', secure: true, httpOnly: true, sameSite: 'Strict' }]);
      const page = await context.newPage(), errors = [];
      page.setDefaultTimeout(15000);
      page.on('pageerror', error => errors.push(error.message));
      page.on('console', message => {
        const offlineFonts = process.env.E2E_OFFLINE_FONTS === '1' && /^Failed to preconnect to https:\/\/fonts\./.test(message.text());
        if (message.type() === 'error' && !/Failed to load resource/i.test(message.text()) && !offlineFonts) errors.push(message.text());
      });
      const request = (path, method = 'GET', body) => page.evaluate(async ({ path, method, body }) => {
        const response = await fetch(path, { method, credentials: 'same-origin', cache: 'no-store',
          headers: body === undefined ? undefined : { 'content-type': 'application/json' },
          body: body === undefined ? undefined : JSON.stringify(body) });
        return { status: response.status, data: await response.json() };
      }, { path, method, body });
      const stored = async id => (await request(`/api/admin/viewings/${id}`)).data.viewing;
      const shot = async (target, name) => {
        if (!process.env.E2E_SHOTS) return;
        mkdirSync(process.env.E2E_SHOTS, { recursive: true });
        await target.screenshot({ path: join(process.env.E2E_SHOTS, `vis14-${name}-${width}.png`) });
      };
      let josh, gil;
      // In a slot picker: a negotiator, the nth enabled weekday from tomorrow on, and its first free time.
      const choose = async (picker, negotiator, n) => {
        await picker.locator('select').selectOption(String(negotiator));
        const days = picker.locator('input[name$="-day"]:not(:disabled)');
        await days.first().waitFor();
        const values = await days.evaluateAll(els => els.map(e => e.value));
        const day = values.filter(d => d > today && [1, 2, 3, 4, 5].includes(new Date(`${d}T12:00:00Z`).getUTCDay()))[n];
        assert.ok(day, `${width}px: a weekday to plan on`);
        await picker.locator(`input[name$="-day"][value="${day}"]`).click();
        const time = picker.locator('input[name$="-time"]:not(:disabled)').first();
        await time.waitFor();
        await time.click();
        return { day, time: await time.inputValue() };
      };

      // The house is flagged above Requests, with who asked and the two plans.
      await page.goto(`${BASE}admin/#/viewings`);
      const people = (await request('/api/admin/negotiators')).data.negotiators;
      [josh, gil] = ['Joshua Franco', 'Gilberto Franco'].map(name => people.find(p => p.name === name).id);
      const plan = page.locator('section.block-plan');
      await plan.getByRole('heading', { name: 'Several people want the same house' }).waitFor();
      const house = plan.locator('article.block-house').filter({ has: page.getByRole('heading', { name: new RegExp(listing) }) });
      await house.getByText('4 open requests for this house.').waitFor();
      for (const name of names) await house.getByText(name).waitFor();
      await shot(plan, 'flagged');

      // Back-to-back: the four move to consecutive free times of Joshua on one day and stay requests.
      await house.getByRole('button', { name: 'Propose back-to-back times' }).click();
      const form = house.locator('form.block-form');
      await page.waitForFunction(() => document.activeElement?.textContent === 'Propose back-to-back times');
      await form.getByRole('button', { name: 'Move 4 requests' }).click();
      await form.getByText('Choose a negotiator, a day and a time').waitFor();
      const b2b = await choose(form.locator('.slot-picker'), josh, nth);
      await shot(form, 'back-to-back');
      const moved = page.waitForResponse(r => r.request().method() === 'POST' && new URL(r.url()).pathname === '/api/admin/viewing-groups/consecutive');
      await form.getByRole('button', { name: 'Move 4 requests' }).click();
      assert.equal((await moved).status(), 200);
      await plan.getByRole('status').filter({ hasText: /^Moved 4 requests to / }).waitFor();
      const after = await Promise.all(ids.map(stored));
      assert.deepEqual(after.map(v => [v.status, v.negotiator_id, v.date]), ids.map(() => ['requested', josh, b2b.day]));
      assert.equal(after[0].time, b2b.time);
      assert.ok(after.every((v, i) => i === 0 || v.time >= after[i - 1].end_time), `back-to-back, never overlapping: ${after.map(v => v.time)}`);

      // Open viewing: one time with Gilberto, five places; each request gets one and stays pending.
      await house.getByRole('button', { name: 'Create open viewing' }).click();
      const open = house.locator('form.block-form');
      const slot = await choose(open.locator('.slot-picker'), gil, nth + 2);
      const places = open.getByLabel('Places');
      assert.equal(await places.inputValue(), '6');
      await places.fill('3');
      await open.getByRole('button', { name: 'Create open viewing' }).click();
      await open.getByText('Choose at least 4 places, one per request').waitFor();
      await page.waitForFunction(() => document.activeElement?.type === 'number');
      await places.fill('5');
      await shot(open, 'open-form');
      const created = page.waitForResponse(r => r.request().method() === 'POST' && new URL(r.url()).pathname === '/api/admin/viewing-groups');
      await open.getByRole('button', { name: 'Create open viewing' }).click();
      assert.equal((await created).status(), 201);
      await plan.getByRole('status').filter({ hasText: 'Open viewing created for' }).waitFor();
      await plan.getByText('4 of 5 places given').waitFor();
      await house.getByText('4 of 5 places taken: 0 confirmed, 4 pending.').waitFor();
      assert.equal(await house.getByText('open requests for this house').count(), 0, 'all four hold a place');
      for (const v of await Promise.all(ids.map(stored)))
        assert.deepEqual([v.status, v.negotiator_id, v.date, v.time], ['requested', gil, slot.day, slot.time]);
      for (const target of [house.getByRole('button', { name: 'Cancel open viewing' })]) {
        const box = await target.boundingBox();
        assert.ok(box.height >= 32, `${width}px: target height ${box.height}`);
      }
      await shot(plan, 'open-viewing');

      // Confirming one viewing, as today, makes one place confirmed.
      const one = await stored(ids[0]);
      assert.equal((await request(`/api/admin/viewings/${ids[0]}`, 'PUT', { action: 'confirm', updated_at: one.updated_at })).status, 200);
      await page.reload();
      await house.getByText('4 of 5 places taken: 1 confirmed, 3 pending.').waitFor();

      // The busy calendar of a new booking shows the open viewing's places at that time, and nobody's details.
      await page.getByRole('button', { name: 'New viewing', exact: true }).click();
      const booking = page.locator('form.view-new');
      await booking.getByLabel('Property').selectOption(listing);
      const picker = booking.locator('.slot-picker');
      await picker.locator('select').selectOption(String(gil));
      await picker.locator(`input[name$="-day"][value="${slot.day}"]`).click();
      const cell = picker.locator('.pick label').filter({ hasText: 'Open viewing' });
      await cell.waitFor();
      assert.equal((await cell.innerText()).replace(/\s+/g, ' ').trim(), `${slot.time} Open viewing 4 of 5 · 1 confirmed`);
      assert.equal(await cell.locator('input').isDisabled(), true, 'the open viewing is not bookable here');
      const calendar = await picker.innerText();
      for (const name of names) assert.equal(calendar.includes(name), false, `${name} is not in the calendar`);
      await shot(picker, 'calendar');
      await booking.getByRole('button', { name: 'Close' }).click();

      // Zoom and width: nothing spills out of the card.
      await page.evaluate(() => { document.documentElement.style.zoom = '2'; });
      const wide = await page.evaluate(() => [...document.querySelectorAll('section.block-plan, section.block-plan *')]
        .filter(e => e.getBoundingClientRect().right > innerWidth + 1).slice(0, 5).map(e => e.tagName));
      assert.deepEqual(wide, [], `no overflow at 200%: ${wide}`);
      await page.evaluate(() => { document.documentElement.style.zoom = '1'; });
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'no horizontal scroll');

      // Cancelling the open viewing cancels its four viewings; nothing is sent.
      page.once('dialog', dialog => {
        assert.match(dialog.message(), /Its 4 viewings are cancelled too\. Nothing is sent/);
        dialog.accept();
      });
      const cancelled = page.waitForResponse(r => r.request().method() === 'POST' && /\/api\/admin\/viewing-groups\/\d+\/cancel$/.test(new URL(r.url()).pathname));
      await house.getByRole('button', { name: 'Cancel open viewing' }).click();
      assert.equal((await cancelled).status(), 200);
      await page.getByRole('status').filter({ hasText: 'Open viewing cancelled, with 4 viewings.' }).waitFor();
      assert.deepEqual((await Promise.all(ids.map(stored))).map(v => v.status), ['cancelled', 'cancelled', 'cancelled', 'cancelled']);
      assert.equal(await page.locator('article.block-house').filter({ has: page.getByRole('heading', { name: new RegExp(listing) }) }).count(), 0);

      assert.deepEqual(errors, [], `${width}px console errors`);
      await context.close();
    }
  } finally { await browser.close(); }
  console.log('VIS-14 open viewings and back-to-back times passed at 1280 and 390.');
})().catch(error => { console.error(error); process.exitCode = 1; });
