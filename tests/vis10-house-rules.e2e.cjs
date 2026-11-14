// VIS-10: house rules for viewings in the listing editor and in Viewings. Local fixture only, synthetic data,
// VIS10_HOUSE_RULES_READY=1 (and PUB07_COMPLIANCE_READY=1 for the occupancy it reads).
const { chromium } = require(process.env.PW || 'playwright-core');
const assert = require('node:assert/strict');
const { readFileSync, mkdirSync } = require('node:fs');
const { parseEnv } = require('node:util');
const { join } = require('node:path');
const BASE = process.env.BASE, vars = parseEnv(readFileSync(process.env.E2E_VARS, 'utf8'));
const KEYS = 'Key safe by the side gate FIXTURE-KEYS', NOTE = 'Ring the tenant first FIXTURE-NOTE';
// 72 hours: the first free time of any week (at most Saturday 13:00 to Monday 10:00 away) is sooner than the notice.
const HOURS = 72;

(async () => {
  assert.ok(BASE && process.env.E2E_PERSIST, 'isolated local fixture required');
  const { signSession, COOKIE } = await import('../server/auth.js');
  const { jerseyToday, plusDays } = await import('../server/viewings.js');
  const browser = await chromium.launch({ executablePath: process.env.CHROME });
  try { for (const [width, listing, who] of [[1280, 'HE-R001', 'Tenant accompanies'], [390, 'HE-R002', 'Joshua Franco']]) {
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
    const shot = async (target, name) => {
      if (!process.env.E2E_SHOTS) return;
      mkdirSync(process.env.E2E_SHOTS, { recursive: true });
      await target.screenshot({ path: join(process.env.E2E_SHOTS, `vis10-${name}-${width}.png`) });
    };
    const rulesPath = `/api/admin/listings/${listing}/viewing-rules`;
    const save = async status => {
      const pending = page.waitForResponse(r => r.request().method() === 'PUT' && new URL(r.url()).pathname === rulesPath);
      await section.getByRole('button', { name: 'Save house rules' }).click();
      assert.equal((await pending).status(), status);
    };

    // The editor's card: empty at first, and it says that notice waits for a tenant.
    await page.goto(`${BASE}admin/#/p/${listing}`);
    const section = page.locator('#s-house-rules');
    await section.getByRole('heading', { name: 'House rules for viewings (internal)' }).waitFor();
    const notice = section.getByLabel('Notice when tenanted (hours)'), shownBy = section.getByLabel('Who shows it'),
      keys = section.getByLabel('Keys'), note = section.getByLabel('Access note');
    assert.deepEqual([await notice.inputValue(), await shownBy.inputValue(), await keys.inputValue(), await note.inputValue()], ['0', '', '', '']);
    await section.getByText('The notice applies only while Occupancy (Legal and compliance) is Tenanted. It is Unknown now.').waitFor();
    assert.equal(await section.getByText('Last changed by').count(), 0);
    const detail = await request(`/api/admin/listings/${listing}`);
    const tenanted = await request(`/api/admin/listings/${listing}`, 'PUT', { updated_at: detail.data.listing.updated_at, occupancy: 'tenanted' });
    assert.equal(tenanted.status, 200, JSON.stringify(tenanted.data));
    await page.reload();
    await section.getByText('This property is marked Tenanted').waitFor();

    // Keyboard, a refused value, then a save that says who made it.
    await notice.focus();
    assert.notEqual(await notice.evaluate(el => getComputedStyle(el).boxShadow), 'none', 'the focused field shows its ring');
    await notice.fill('200');
    await save(400);
    await section.getByText('Choose 0 to 168 hours').waitFor();
    assert.equal(await notice.getAttribute('aria-invalid'), 'true');
    await notice.fill(String(HOURS));
    await shownBy.selectOption({ label: who });
    await keys.fill(KEYS);
    await note.fill(NOTE);
    await shot(section, 'editor');
    await save(200);
    await section.getByText('House rules saved.').waitFor();
    await section.getByText('Last changed by admin@example.test').waitFor();
    for (const target of [notice, shownBy, keys, section.getByRole('button', { name: 'Save house rules' })]) {
      const box = await target.boundingBox();
      assert.ok(box.height >= 32, `${width}px: target height ${box.height}`);
    }
    await page.evaluate(() => { document.documentElement.style.zoom = '2'; });
    const wide = await page.evaluate(() => [...document.querySelectorAll('#s-house-rules, #s-house-rules *')]
      .filter(e => e.getBoundingClientRect().right > innerWidth + 1).slice(0, 5).map(e => e.tagName));
    assert.deepEqual(wide, [], `no overflow at 200%: ${wide}`);
    await page.evaluate(() => { document.documentElement.style.zoom = '1'; });

    // Saved values come back; a save over someone else's is refused and theirs stays.
    await page.reload();
    await section.getByText('Last changed by admin@example.test').waitFor();
    assert.deepEqual([await notice.inputValue(), await shownBy.locator('option:checked').textContent(), await keys.inputValue(), await note.inputValue()],
      [String(HOURS), who, KEYS, NOTE]);
    const stored = (await request(rulesPath)).data;
    const other = await request(rulesPath, 'PUT', { notice_hours: stored.notice_hours, shown_by: stored.shown_by, negotiator_id: stored.negotiator_id,
      keys: `${KEYS} 2`, access_note: stored.access_note, updated_at: stored.updated_at });
    assert.equal(other.status, 200, JSON.stringify(other.data));
    await note.fill('Mine');
    await save(409);
    await section.getByRole('alert').filter({ hasText: 'Someone else saved changes to these house rules.' }).waitFor();
    assert.equal((await request(rulesPath)).data.access_note, NOTE);
    const back = await request(rulesPath, 'PUT', { ...other.data, keys: KEYS });
    assert.equal(back.status, 200, JSON.stringify(back.data));

    // New viewing: the team sees the rules of the chosen property; a far day needs nothing, a near one a confirmation.
    await page.goto(`${BASE}admin/#/viewings?listing=${listing}`);
    await page.getByRole('button', { name: 'New viewing', exact: true }).click();
    const form = page.locator('form.view-new'), facts = form.locator('dl[aria-label="House rules"]');
    await facts.getByText(`Tenanted · ${HOURS} hours' notice`).waitFor();
    for (const text of [who, KEYS, NOTE]) await facts.getByText(text, { exact: true }).waitFor();
    const picker = form.locator('.slot-picker'), agreed = form.getByLabel('Access is agreed with the tenant');
    const people = (await request('/api/admin/negotiators')).data.negotiators;
    await picker.locator('select').selectOption(String(people.find(p => p.name === 'Joshua Franco').id));
    const days = picker.locator('input[name$="-day"]:not(:disabled)'), times = picker.locator('input[name$="-time"]:not(:disabled)');
    await days.first().waitFor();
    await days.last().click();
    await times.first().click();
    assert.ok(await days.last().inputValue() > plusDays(jerseyToday(), 4), 'the last day offered is beyond the notice');
    assert.equal(await agreed.count(), 0, 'enough notice asks for nothing');
    await days.first().click();
    await times.first().click();
    await agreed.waitFor();
    await form.getByLabel('Name').fill('Jane Le Brocq');
    await form.getByLabel('Phone').fill('07797 123456');
    await form.getByRole('button', { name: 'Book viewing' }).click();
    await form.getByText('Confirm that access is agreed with the tenant, or choose a later time').waitFor();
    await page.waitForFunction(() => document.activeElement?.type === 'checkbox');
    assert.equal(await page.locator('.inbox-detail').getByText('Jane Le Brocq').count(), 0, 'nothing is booked without the confirmation');
    await agreed.check();
    await shot(form, 'new-viewing');
    const booked = page.waitForResponse(r => r.request().method() === 'POST' && new URL(r.url()).pathname === '/api/admin/viewings');
    await form.getByRole('button', { name: 'Book viewing' }).click();
    assert.equal((await booked).status(), 201);

    // The viewing itself shows them, and moving it to another near time asks again.
    const open = page.locator('article.inbox-detail');
    await open.getByRole('heading', { name: /Jane Le Brocq/ }).waitFor();
    for (const text of [`Tenanted · ${HOURS} hours' notice`, who, KEYS, NOTE]) await open.locator('dd.house-note').getByText(text, { exact: true }).waitFor();
    await shot(open, 'viewing');
    await open.getByRole('button', { name: 'Reschedule' }).click();
    const move = open.locator('form.view-form'), moveTimes = move.locator('.slot-picker input[name$="-time"]:not(:disabled)');
    await move.locator('.slot-picker input[name$="-day"]:not(:disabled)').first().click();
    await moveTimes.first().waitFor();
    await moveTimes.last().click();
    await move.getByRole('button', { name: 'Save new time' }).click();
    await move.getByText('Confirm that access is agreed with the tenant, or choose a later time').waitFor();
    await move.getByLabel('Access is agreed with the tenant').check();
    const moved = page.waitForResponse(r => r.request().method() === 'PUT' && /\/api\/admin\/viewings\/\d+$/.test(new URL(r.url()).pathname));
    await move.getByRole('button', { name: 'Save new time' }).click();
    assert.equal((await moved).status(), 200);
    await page.getByText(/^Moved to /).waitFor();
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'no horizontal scroll');

    // The website offers no time sooner than the notice and never receives the rules.
    const web = await request(`/api/availability?listing_id=${listing}`);
    assert.equal(web.status, 200);
    const offered = web.data.days.filter(d => Object.values(d.slots).some(s => s.length)).map(d => d.date);
    assert.ok(offered.length > 0, 'the website still offers later times');
    assert.ok(offered.every(date => date > plusDays(jerseyToday(), 2)), `no day within the notice: ${offered[0]}`);
    const site = await request('/api/listings');
    assert.ok(site.data.some(l => l.id === listing));
    const publicPage = await context.newPage();
    await publicPage.goto(`${BASE}p/${listing}`);
    await publicPage.locator('.summary').waitFor();
    const seen = JSON.stringify([web.data, site.data]) + await publicPage.content();
    for (const secret of ['FIXTURE-KEYS', 'FIXTURE-NOTE', 'notice_hours', 'shown_by']) assert.ok(!seen.includes(secret), secret);
    await publicPage.close();

    assert.deepEqual(errors, []);
    await context.close();
    console.log(`VIS-10 house rules ${width}px: editor, validation, stale save, booking and move confirmations, viewing facts, website, keyboard and 200% zoom passed.`);
  } } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
