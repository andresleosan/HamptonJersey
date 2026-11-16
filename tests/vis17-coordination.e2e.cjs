// VIS-17: a viewing agreed with several people from its detail in Viewings: propose a time with the client's search
// linked, record each answer with how and when, and the viewing is confirmed only after the last one. Local fixture
// only, synthetic data, VIS17_MULTIPART_READY=1.
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
    const anonymous = await browser.newContext({ ignoreHTTPSErrors: true }); // the fixture's own local certificate
    for (const [method, path] of [['GET', 'api/admin/viewings/1/coordination'], ['POST', 'api/admin/viewings/1/proposals']]) {
      const r = await anonymous.request.fetch(`${BASE}${path}`, { method, headers: { origin: new URL(BASE).origin }, data: method === 'POST' ? {} : undefined });
      assert.equal(r.status(), 401, `${method} ${path} signed out`);
    }
    await anonymous.close();

    for (const [width, listing, id, nth] of [[1280, 'HE-R002', 700, 0], [390, 'HE-R004', 701, 2]]) {
      // A website request far ahead with Gilberto, and the same person's search to rent, free on weekdays 09:00-18:00.
      const email = `coord${width}@example.je`, far = plusDays(today, 40);
      sql(`INSERT INTO viewing_requests (id, listing_id, listing_ref, listing_title_snapshot, agent, negotiator_id, kind, date, time,
        end_time, name, email, status, created_at) VALUES (${id}, '${listing}', '${listing}', 'Fixture',
        (SELECT name FROM negotiators WHERE id = 1), 1, 'In person', '${far}', '10:00', '10:30', 'Coord ${width}', '${email}',
        'requested', '2026-11-01T10:00:00.000Z')`);
      sql(`INSERT INTO contacts (id, name, email, last_activity_at, created_at, updated_at) VALUES (${id}, 'Coord ${width}', '${email}',
        '2026-11-01T10:00:00.000Z', '2026-11-01T10:00:00.000Z', '2026-11-01T10:00:00.000Z')`);
      const windows = JSON.stringify([1, 2, 3, 4, 5].map(day => ({ day, start: '09:00', end: '18:00' })));
      sql(`INSERT INTO applicants (id, contact_id, operation, source, created_at, updated_at, viewing_availability) VALUES (${id}, ${id},
        'rent', 'web', '2026-11-01T10:00:00.000Z', '2026-11-01T10:00:00.000Z', '${windows}')`);

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
      const stored = async () => (await request(`/api/admin/viewings/${id}`)).data.viewing;
      const shot = async (target, name) => {
        if (!process.env.E2E_SHOTS) return;
        mkdirSync(process.env.E2E_SHOTS, { recursive: true });
        await target.screenshot({ path: join(process.env.E2E_SHOTS, `vis17-${name}-${width}.png`) });
      };

      await page.goto(`${BASE}admin/#/viewings?viewing=${id}`);
      const detail = page.locator('article.inbox-detail');
      await detail.getByRole('heading', { name: new RegExp(`Coord ${width}`) }).waitFor();
      const coord = detail.locator('section.coord');
      await coord.getByRole('heading', { name: 'Agree a time with everyone' }).waitFor();
      await detail.getByRole('button', { name: 'Confirm', exact: true }).waitFor();

      // Propose: Joshua, a free weekday time; the negotiator attends too; her search linked.
      const josh = (await request('/api/admin/negotiators')).data.negotiators.find(p => p.name === 'Joshua Franco').id;
      await coord.getByRole('button', { name: 'Propose a time' }).click();
      const form = coord.locator('form.coord-form');
      await page.waitForFunction(() => document.activeElement?.textContent === 'Propose a time');
      await form.getByRole('button', { name: 'Propose this time' }).click();
      await form.getByRole('alert').filter({ hasText: 'Choose a negotiator, a day and a time' }).waitFor();
      const picker = form.locator('.slot-picker');
      await picker.locator('select').selectOption(String(josh));
      const days = picker.locator('input[name$="-day"]:not(:disabled)');
      await days.first().waitFor();
      const values = await days.evaluateAll(els => els.map(e => e.value));
      const day = values.filter(d => d > today && [1, 2, 3, 4, 5].includes(new Date(`${d}T12:00:00Z`).getUTCDay()))[nth];
      assert.ok(day, `${width}px: a weekday to propose`);
      await picker.locator(`input[name$="-day"][value="${day}"]`).click();
      const timeInput = picker.locator('input[name$="-time"]:not(:disabled)').first();
      await timeInput.waitFor();
      await timeInput.click();
      const time = await timeInput.inputValue();
      await form.getByLabel('Negotiator (attending)').check();
      await form.getByLabel('Their search').selectOption(String(id));
      await form.getByText("Inside the client's preferred times").waitFor();
      await shot(form, 'propose');
      const proposed = page.waitForResponse(r => r.request().method() === 'POST' && new URL(r.url()).pathname === `/api/admin/viewings/${id}/proposals`);
      await form.getByRole('button', { name: 'Propose this time' }).click();
      assert.equal((await proposed).status(), 201);
      await page.getByRole('status').filter({ hasText: `Time proposed for` }).waitFor();
      await coord.getByText('Time proposed', { exact: true }).waitFor();
      assert.equal(await detail.getByRole('button', { name: 'Confirm', exact: true }).count(), 0, 'Confirm cannot skip the others');
      let v = await stored();
      assert.deepEqual([v.status, v.date, v.time], ['requested', far, '10:00'], 'the request keeps its time while pending');

      // Each answer, by hand, with how and when. The form asks again if something is missing.
      const record = async (who, channel, answeredBy) => {
        const item = coord.locator('ul.coord-people > li').filter({ hasText: who });
        await item.getByRole('button', { name: 'Record answer' }).click();
        const answer = item.locator('form.coord-form');
        await page.waitForFunction(() => /answer$/.test(document.activeElement?.textContent ?? ''));
        if (who === 'Client') {
          await answer.getByRole('button', { name: 'Save answer' }).click();
          await answer.getByText('Choose accepted or declined').waitFor();
          await shot(coord, 'answer-errors');
        }
        await answer.getByLabel('Accepted').check();
        await answer.getByLabel('How they answered').selectOption(channel);
        if (answeredBy) await answer.getByLabel('Who answered (optional)').fill(answeredBy);
        const saved = page.waitForResponse(r => r.request().method() === 'POST' && /\/responses$/.test(new URL(r.url()).pathname));
        await answer.getByRole('button', { name: 'Save answer' }).click();
        return (await saved).json();
      };
      assert.equal((await record('Client', 'phone')).confirmed, false);
      await page.getByRole('status').filter({ hasText: "Client's answer saved." }).waitFor();
      await coord.getByText('Waiting for answers', { exact: true }).waitFor();
      assert.equal((await stored()).status, 'requested', 'one answer confirms nothing');

      // Zoom and width while the coordination is open: nothing spills out; targets reach 32px (44px on phones).
      for (const target of [coord.getByRole('button', { name: 'Record answer' }).first(), coord.getByRole('button', { name: 'Propose another time' })]) {
        const box = await target.boundingBox();
        assert.ok(box.height >= (width < 760 ? 44 : 32), `${width}px: target height ${box.height}`);
      }
      // 200% at 1280 only, as VIS-08: at 390 it leaves 195px, less than the 240px columns every viewing's facts ask for.
      if (width === 1280) {
        await page.evaluate(() => { document.documentElement.style.zoom = '2'; });
        const wide = await page.evaluate(() => [...document.querySelectorAll('section.coord, section.coord *')]
          .filter(e => e.getBoundingClientRect().right > innerWidth + 1).slice(0, 5).map(e => e.tagName));
        assert.deepEqual(wide, [], `no overflow at 200%: ${wide}`);
        await page.evaluate(() => { document.documentElement.style.zoom = '1'; });
      }
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'no horizontal scroll');
      await shot(coord, 'waiting');

      assert.equal((await record('Advertiser or agency', 'email', 'Agency front desk')).confirmed, false);
      await page.getByRole('status').filter({ hasText: "Advertiser or agency's answer saved." }).waitFor();
      const last = await record('Negotiator (attending)', 'in_person');
      assert.equal(last.confirmed, true);
      await page.getByRole('status').filter({ hasText: /^Everyone accepted\. The viewing is confirmed for / }).waitFor();
      v = await stored();
      assert.deepEqual([v.status, v.negotiator_id, v.date, v.time], ['confirmed', josh, day, time]);

      // A late answer to the closed proposal is refused and changes nothing.
      const p = last.proposal;
      const late = await request(`/api/admin/viewings/${id}/proposals/${p.id}/responses`, 'POST', { revision: p.revision,
        participant: 'client', response: 'declined', channel: 'phone', answered_at: new Date().toISOString() });
      assert.equal(late.status, 409);
      assert.equal((await stored()).status, 'confirmed');

      assert.deepEqual(errors, [], `${width}px console errors`);
      await context.close();
    }
  } finally { await browser.close(); }
  console.log('VIS-17 multi-party viewing coordination passed at 1280 and 390.');
})().catch(error => { console.error(error); process.exitCode = 1; });
