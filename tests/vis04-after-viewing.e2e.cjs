// VIS-04: the decision after a viewing and what it leaves for the team: the next step in Viewings, the follow-up task in
// the Inbox (Proceed and Need more information; nothing for Not interested) and the answer in the applicant's Timeline.
// Local fixture only, synthetic data, VIS04_OUTCOME_READY=1 and VIS08_CYCLE_READY=1.
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
const NOTE = 'Wants the survey FIXTURE-NOTE', AT = '2026-11-01T10:00:00.000Z';

(async () => {
  assert.ok(BASE && process.env.E2E_PERSIST, 'isolated local fixture required');
  const { signSession, COOKIE } = await import('../server/auth.js');
  const { jerseyToday, plusDays } = await import('../server/viewings.js');
  const yesterday = plusDays(jerseyToday(), -1);
  const browser = await chromium.launch({ executablePath: process.env.CHROME });
  try { for (const [width, listing, first] of [[1280, 'HE-R001', 400], [390, 'HE-R002', 500]]) {
    // One search (stage Viewing) and three viewings of its contact held yesterday, one for each decision.
    const email = `vis04-${width}@example.je`, search = 940000 + width;
    const yes = `Pia Proceed ${width}`, more = `Mo More ${width}`, no = `Nia No ${width}`;
    const viewing = (id, name, time, end) => `(${id},'${listing}','${listing}','Fixture',(SELECT name FROM negotiators WHERE id = 1),1,
      'In person','${yesterday}','${time}','${end}','${name}','${email}','confirmed','${AT}')`;
    sql(`INSERT INTO contacts (id, name, email, last_activity_at, created_at, updated_at) VALUES (${search}, 'Vis04 Fixture ${width}', '${email}', '${AT}', '${AT}', '${AT}');
      INSERT INTO applicants (id, contact_id, operation, stage, source, created_at, updated_at) VALUES (${search}, ${search}, 'rent', 'viewing', 'web', '${AT}', '${AT}');
      INSERT INTO viewing_requests (id, listing_id, listing_ref, listing_title_snapshot, agent, negotiator_id, kind, date, time, end_time,
        name, email, status, created_at) VALUES ${[viewing(first, yes, '10:00', '10:30'), viewing(first + 1, more, '11:00', '11:30'),
    viewing(first + 2, no, '12:00', '12:30')].join(',')}`);

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
    const read = path => page.evaluate(async p => (await fetch(p, { credentials: 'same-origin', cache: 'no-store' })).json(), path);
    const shot = async (target, name) => {
      if (!process.env.E2E_SHOTS) return;
      mkdirSync(process.env.E2E_SHOTS, { recursive: true });
      await target.screenshot({ path: join(process.env.E2E_SHOTS, `vis04-${name}-${width}.png`) });
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
    // A press that writes: the viewing's PUT, then the exact message shown once the list has been read again.
    const saved = async (button, message) => {
      const put = page.waitForResponse(r => r.request().method() === 'PUT' && /\/api\/admin\/viewings\/\d+$/.test(new URL(r.url()).pathname));
      await button.click();
      assert.equal((await put).status(), 200);
      await page.getByRole('status').filter({ hasText: message }).waitFor();
      assert.equal(await page.getByRole('status').filter({ hasText: message }).textContent(), message);
    };
    const next = () => open.locator('dl.kv div').filter({ has: page.locator('dt', { hasText: /^Next step$/ }) }).locator('dd');
    const complete = async (name, answer) => {
      await show('Needs outcome', name);
      await open.getByRole('button', { name: 'Mark completed' }).click();
      await page.waitForFunction(() => document.activeElement?.id === 'h-outcome');
      await form.getByText('Proceed and Need more information leave a follow-up task in the Inbox.').waitFor();
      await form.getByLabel(answer, { exact: true }).check();
    };

    // Proceed, answered on the spot: the message names the task, and Past shows the decision and the next step.
    await page.goto(`${BASE}admin/#/viewings?listing=${listing}`);
    await complete(yes, 'Proceed');
    await form.getByLabel('Reason (optional)').fill(NOTE);
    await shot(open, 'outcome-form');
    await saved(form.getByRole('button', { name: 'Save outcome' }), "Outcome saved. It's in Past now, with a follow-up task in the Inbox.");
    await show('Past', yes);
    assert.equal(await open.locator('h2 .badge').textContent(), 'Feedback received');
    assert.equal(await next().textContent(), 'Take their offer or application');
    await shot(open, 'proceed');

    // Need more information, answered later: no next step while the answer is awaited, then the task and the step.
    await complete(more, 'No answer yet');
    await saved(form.getByRole('button', { name: 'Save outcome' }), "Marked completed. It's in Past, waiting for their answer.");
    await show('Past', more);
    await open.getByText('Waiting for their answer', { exact: true }).waitFor();
    assert.equal(await next().count(), 0);
    await open.getByRole('button', { name: 'Record feedback' }).click();
    await page.waitForFunction(() => document.activeElement?.id === 'h-outcome');
    await form.getByLabel('Need more information').check();
    await saved(form.getByRole('button', { name: 'Save feedback' }), 'Feedback saved. A follow-up task is in the Inbox.');
    assert.equal(await next().textContent(), 'Send them what they asked for');

    // Not interested: no task, and the panel says that nothing else changes.
    await complete(no, 'Not interested');
    await saved(form.getByRole('button', { name: 'Save outcome' }), "Outcome saved. It's in Past now.");
    await show('Past', no);
    assert.equal(await next().textContent(), 'None. This does not close their search or reject a match.');
    await shot(open, 'not-interested');
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'no horizontal scroll in Viewings');

    // The Inbox has the two follow-ups of this width and none for Not interested; each opens its viewing.
    const mine = (await read('/api/admin/notifications?box=action')).notifications.filter(n => [yes, more, no].some(name => n.title.endsWith(name)));
    assert.deepEqual(mine.map(n => [n.title, n.category, n.link]), [[`Wants to proceed: ${yes}`, 'task', `#/viewings?viewing=${first}`],
      [`Needs more information: ${more}`, 'task', `#/viewings?viewing=${first + 1}`]]);
    assert.ok(!JSON.stringify(mine).includes('FIXTURE-NOTE'), 'the reason is not in the task');
    await page.goto(`${BASE}admin/#/`);
    const task = page.locator('.inbox-list li').filter({ hasText: `Wants to proceed: ${yes}` });
    await task.waitFor();
    assert.equal(await task.locator('.what').textContent(), 'Shared task');
    await task.getByRole('button').click();
    const notice = page.locator('article.inbox-detail');
    await notice.getByRole('heading', { name: `Wants to proceed: ${yes}` }).waitFor();
    await shot(page, 'inbox-task');
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'no horizontal scroll in the Inbox');
    await notice.getByRole('link', { name: 'Open viewing' }).click();
    await open.getByRole('heading', { name: new RegExp(yes) }).waitFor();
    assert.equal(await next().textContent(), 'Take their offer or application');

    // The search is as it was: no decision moves its stage or closes it.
    const { applicant } = await read(`/api/admin/applicants/${search}`);
    assert.deepEqual([applicant.stage, applicant.archived_at ?? null], ['viewing', null]);

    // The applicant's Timeline shows each viewing's answer, when it was received and who recorded it; never the reason.
    // This step needs the Timeline line of ApplicantDetail.jsx (VIS-04's ficha).
    await page.goto(`${BASE}admin/#/applicants/${search}/timeline`);
    const line = time => page.locator('ol.timeline li').filter({ hasText: `at ${time}` });
    await line('12:00').waitFor();
    for (const [time, answer] of [['10:00', 'Proceed'], ['11:00', 'Need more information'], ['12:00', 'Not interested']]) {
      const facts = await line(time).locator('p.meta span').allTextContents();
      assert.equal(facts[2], 'Completed', `${time}: ${facts}`);
      assert.equal(facts[3], answer, `${time}: the Timeline shows the answer (${facts})`);
      assert.match(facts[4], /^Feedback .+ · recorded by .+$/, `${time}: ${facts}`);
    }
    assert.equal(await page.locator('ol.timeline').getByText('FIXTURE-NOTE').count(), 0);
    await shot(page.locator('ol.timeline'), 'timeline');
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'no horizontal scroll in the Timeline');

    assert.deepEqual(errors, []);
    await context.close();
    console.log(`VIS-04 after viewing ${width}px: next step in Viewings, follow-up tasks in the Inbox, nothing for Not interested, answer in the Timeline passed.`);
  } } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
