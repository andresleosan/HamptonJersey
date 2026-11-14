// VIS-08: the cycle of a viewing in Viewings: reminder due and Mark reminded, completed before the answer and Record
// feedback, and the house's notice asked again on Confirm. Local fixture only, synthetic data, VIS08_CYCLE_READY=1
// (and VIS10_HOUSE_RULES_READY=1 for the notice).
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
const SUMMARY = 'Asked about the parking FIXTURE-SUMMARY';

(async () => {
  assert.ok(BASE && process.env.E2E_PERSIST, 'isolated local fixture required');
  const { signSession, COOKIE } = await import('../server/auth.js');
  const { jerseyToday, plusDays } = await import('../server/viewings.js');
  const today = jerseyToday();
  const browser = await chromium.launch({ executablePath: process.env.CHROME });
  try { for (const [width, listing, first] of [[1280, 'HE-R001', 100], [390, 'HE-R002', 200]]) {
    // Four viewings of this width's listing: one tonight and not reminded, one far away, one held yesterday and one
    // request for tomorrow at a tenanted house that asks for 72 hours' notice.
    const due = `Dora Due ${width}`, far = `Fay Far ${width}`, held = `Hal Held ${width}`, asked = `Rae Request ${width}`;
    const viewing = (id, name, status, date, time, end) => `(${id},'${listing}','${listing}','Fixture',
      (SELECT name FROM negotiators WHERE id = 1),1,'In person','${date}','${time}','${end}','${name}','fixture${id}@example.je','${status}','2026-11-01T10:00:00.000Z')`;
    sql(`UPDATE listings SET occupancy = 'tenanted' WHERE id = '${listing}';
      INSERT INTO listing_viewing_rules (listing_id, notice_hours, updated_at, updated_by) VALUES ('${listing}', 72, '2026-11-01T10:00:00.000Z', 'fixture');
      INSERT INTO viewing_requests (id, listing_id, listing_ref, listing_title_snapshot, agent, negotiator_id, kind, date, time, end_time,
        name, email, status, created_at) VALUES ${[viewing(first, due, 'confirmed', today, '23:30', '24:00'),
    viewing(first + 1, far, 'confirmed', plusDays(today, 5), '10:00', '10:30'),
    viewing(first + 2, held, 'confirmed', plusDays(today, -1), '10:00', '10:30'),
    viewing(first + 3, asked, 'requested', plusDays(today, 1), '10:00', '10:30')].join(',')}`);

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
    const stored = async id => (await page.evaluate(async path => (await fetch(path, { credentials: 'same-origin', cache: 'no-store' })).json(),
      `/api/admin/viewings/${id}`)).viewing;
    const shot = async (target, name) => {
      if (!process.env.E2E_SHOTS) return;
      mkdirSync(process.env.E2E_SHOTS, { recursive: true });
      await target.screenshot({ path: join(process.env.E2E_SHOTS, `vis08-${name}-${width}.png`) });
    };
    const open = page.locator('article.inbox-detail'), form = open.locator('form.view-form');
    const row = name => page.locator('.inbox-list li').filter({ hasText: name });
    // A tab's list once it has finished loading, then one of its viewings.
    const show = async (tab, name) => {
      await page.getByRole('group', { name: 'Viewings' }).getByRole('button', { name: new RegExp(`^${tab}`) }).click();
      await row(name).waitFor();
      await row(name).getByRole('button').click();
      await open.getByRole('heading', { name: new RegExp(name) }).waitFor();
    };
    // A press that writes: the viewing's PUT with its status, then the message shown once the list has been read again.
    const saved = async (button, status, message) => {
      const put = page.waitForResponse(r => r.request().method() === 'PUT' && /\/api\/admin\/viewings\/\d+$/.test(new URL(r.url()).pathname));
      await button.click();
      assert.equal((await put).status(), status);
      if (message) await page.getByRole('status').filter({ hasText: message }).waitFor();
    };
    const badge = () => open.locator('h2 .badge').textContent();

    // Upcoming: tonight's viewing is marked as due a reminder, the far one is not.
    await page.goto(`${BASE}admin/#/viewings?listing=${listing}`);
    await show('Upcoming', due);
    await row(far).waitFor();
    assert.equal(await row(due).getByText('Reminder due', { exact: true }).count(), 1);
    assert.equal(await row(far).locator('.badge').count(), 0, 'a viewing days away shows no reminder badge');
    await open.getByText(`This viewing is in less than 24 hours and ${due} has not been reminded yet.`).waitFor();
    await open.getByText('Not reminded yet', { exact: true }).waitFor();
    assert.equal(await badge(), 'Confirmed');
    await shot(page, 'upcoming-due');

    // Mark reminded: the form takes the focus, refuses an empty choice, and records how, when and who.
    await open.getByRole('button', { name: 'Mark reminded' }).click();
    await page.waitForFunction(() => document.activeElement?.id === 'h-remind');
    await form.getByText('Nothing is sent from here.').waitFor();
    await form.getByRole('button', { name: 'Save reminder' }).click();
    await form.getByText('Choose how you reminded them').waitFor();
    await page.waitForFunction(() => document.activeElement?.type === 'radio');
    assert.equal((await stored(first)).reminded_at, null, 'nothing is recorded without a channel');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    assert.equal(await form.getByLabel('WhatsApp').isChecked(), true, 'the channels are chosen with the keyboard');
    for (const target of [form.getByLabel('WhatsApp').locator('xpath=..'), form.getByRole('button', { name: 'Save reminder' })]) {
      const box = await target.boundingBox();
      assert.ok(box.height >= 32, `${width}px: target height ${box.height}`);
    }
    await shot(open, 'remind-form');
    await saved(form.getByRole('button', { name: 'Save reminder' }), 200, 'Marked as reminded.');
    assert.equal(await badge(), 'Reminded');
    await open.locator('dd').filter({ hasText: /^WhatsApp · .* · admin@example\.test$/ }).waitFor();
    assert.equal(await open.getByRole('button', { name: 'Mark reminded' }).count(), 0);
    assert.equal(await open.getByText('has not been reminded yet').count(), 0);
    assert.equal(await row(due).getByText('Reminded', { exact: true }).count(), 1);
    assert.equal(await row(due).getByText('Reminder due').count(), 0);
    const reminded = await stored(first);
    assert.deepEqual([reminded.status, reminded.reminded_channel, reminded.reminded_by], ['confirmed', 'whatsapp', 'admin@example.test']);
    await shot(open, 'reminded');

    // Needs outcome: the viewing was held but the client has not answered yet.
    await show('Needs outcome', held);
    await open.getByRole('button', { name: 'Mark completed' }).click();
    assert.deepEqual(await form.locator('.choices label').allTextContents(), ['Proceed', 'Need more information', 'Not interested', 'No answer yet']);
    await form.getByLabel('No answer yet').check();
    await saved(form.getByRole('button', { name: 'Save outcome' }), 200, "Marked completed. It's in Past, waiting for their answer.");
    assert.equal((await stored(first + 2)).outcome, null);

    // Past: it reads Completed until the feedback is recorded, then Feedback received with its date and who took it.
    await show('Past', held);
    assert.equal(await row(held).locator('.badge').textContent(), 'Completed');
    assert.equal(await badge(), 'Completed');
    await open.getByText('Waiting for their answer', { exact: true }).waitFor();
    await open.getByRole('button', { name: 'Record feedback' }).click();
    await page.waitForFunction(() => document.activeElement?.id === 'h-outcome');
    await form.getByRole('heading', { name: 'Record feedback' }).waitFor();
    assert.deepEqual(await form.locator('.choices label').allTextContents(), ['Proceed', 'Need more information', 'Not interested']);
    await form.getByRole('button', { name: 'Save feedback' }).click();
    await form.getByText('Choose an outcome').waitFor();
    await form.getByLabel('Need more information').check();
    await form.getByLabel('Reason (optional)').fill(SUMMARY);
    await shot(open, 'feedback-form');
    await saved(form.getByRole('button', { name: 'Save feedback' }), 200, 'Feedback saved.');
    assert.equal(await badge(), 'Feedback received');
    assert.equal(await row(held).locator('.badge').textContent(), 'Feedback received');
    await open.locator('dd').filter({ hasText: `Need more information · ${SUMMARY}` }).waitFor();
    await open.locator('dd').filter({ hasText: /recorded by admin@example\.test$/ }).waitFor();
    assert.equal(await open.getByRole('button', { name: 'Record feedback' }).count(), 0, 'feedback is recorded once');
    const answered = await stored(first + 2);
    assert.deepEqual([answered.status, answered.outcome, answered.outcome_note, answered.feedback_by],
      ['completed', 'more_info', SUMMARY, 'admin@example.test']);
    assert.ok(answered.feedback_at);
    await shot(open, 'feedback');
    // 200% at 1280 only: at 390 it leaves 195px, less than the 240px columns every viewing's facts already ask for.
    if (width === 1280) {
      await page.evaluate(() => { document.documentElement.style.zoom = '2'; });
      const wide = await page.evaluate(() => [...document.querySelectorAll('article.inbox-detail, article.inbox-detail *')]
        .filter(e => e.getBoundingClientRect().right > innerWidth + 1).slice(0, 5).map(e => e.tagName));
      assert.deepEqual(wide, [], `no overflow at 200%: ${wide}`);
      await page.evaluate(() => { document.documentElement.style.zoom = '1'; });
    }
    if (listing === 'HE-R001') {
      // An outcome saved before the cycle existed counts as feedback received, with no date made up for it.
      await row('Mark Querée').getByRole('button').click();
      await open.getByRole('heading', { name: /Mark Querée/ }).waitFor();
      assert.equal(await badge(), 'Feedback received');
      assert.equal(await open.locator('dt').filter({ hasText: 'Feedback received' }).count(), 0);
    }

    // Requests: tomorrow is sooner than the house's 72 hours, so Confirm waits for staff to say access is agreed.
    await show('Requests', asked);
    const agreed = open.getByLabel('Access is agreed with the tenant');
    await agreed.waitFor();
    await open.getByRole('button', { name: 'Confirm', exact: true }).click();
    await open.getByRole('alert').filter({ hasText: 'Confirm that access is agreed with the tenant, or reschedule to a later time' }).waitFor();
    assert.equal((await stored(first + 3)).status, 'requested', 'nothing is confirmed without the confirmation');
    await agreed.check();
    await shot(open, 'confirm-notice');
    await saved(open.getByRole('button', { name: 'Confirm', exact: true }), 200, "Confirmed. It's in Upcoming now.");
    assert.equal((await stored(first + 3)).status, 'confirmed');
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'no horizontal scroll');

    assert.deepEqual(errors, []);
    await context.close();
    console.log(`VIS-08 viewing cycle ${width}px: reminder due, Mark reminded, completed before the answer, Record feedback, notice on Confirm${
      width === 1280 ? ', keyboard and 200% zoom' : ' and keyboard'} passed.`);
  } } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
