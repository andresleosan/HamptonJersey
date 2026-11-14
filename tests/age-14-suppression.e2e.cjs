// AGE-14, executed only by the disposable local fixture with AGE14_SUPPRESSION_READY=1. Synthetic data only.
// Covers: confirmation by keyboard, held GET in another tab, lost event (separate context) revalidated on resume,
// stale save refused, 503 reload and back navigation without old personal data, conflict, 200% zoom.
const { chromium } = require(process.env.PW || 'playwright-core');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { parseEnv } = require('node:util');
const { execFileSync } = require('node:child_process');
const { join, dirname } = require('node:path');
const BASE = process.env.BASE, vars = parseEnv(readFileSync(process.env.E2E_VARS, 'utf8'));
const wrangler = join(dirname(require.resolve('wrangler')), '..', 'bin', 'wrangler.js');
const sql = statement => execFileSync(process.execPath, [wrangler, 'd1', 'execute', 'hampton', '--local',
  '--persist-to', process.env.E2E_PERSIST, '--command', statement], { stdio: 'pipe' });
const T = '2026-11-01T10:00:00.000Z';
const seed = (id, w) => {
  const details = JSON.stringify({ contacts: [{ name: `Synthetic Contact ${w}`, email: `person${w}@example.test`,
    phones: [{ label: 'Mobile', number: `07700 9${w}` }] }], channels: [], source_ids: [], listing_ids: [], commission: '', photo_permission: '' });
  sql(`INSERT INTO advertisers(id,name,kind,details,activity_on,created_at,updated_at,updated_by)
    VALUES(${id},'Synthetic Person ${w}','individual','${details}','2025-01-01','${T}','${T}','fixture');
    INSERT INTO outbound(ref,dedupe_key,template,entity_id,version,recipient,recipient_hash,status,approved_at,created_at,updated_at)
    VALUES('age14-${w}','age14-${w}','synthetic','1',1,'person${w}@example.test','hash','queued','${T}','${T}','${T}');
    INSERT INTO email_inbound(dedupe_key,sender,recipient,subject,text,html_only,truncated,received_at)
    VALUES('age14-${w}','person${w}@example.test','team@example.test','Synthetic','Synthetic',0,0,'${T}');`);
  return [`Synthetic Person ${w}`, `Synthetic Contact ${w}`, `person${w}@example.test`, `07700 9${w}`];
};
// Visible text plus every field value: nothing removed may remain anywhere in the page.
const leaks = (page, secrets) => page.evaluate(s => {
  const text = document.body.innerText + ' ' + [...document.querySelectorAll('input,textarea,select')].map(e => e.value).join(' ');
  return s.filter(x => text.includes(x));
}, secrets);
const waitClean = (page, secrets) => page.waitForFunction(s => {
  const text = document.body.innerText + ' ' + [...document.querySelectorAll('input,textarea,select')].map(e => e.value).join(' ');
  return s.every(x => !text.includes(x));
}, secrets);

(async () => {
  assert.ok(BASE && process.env.E2E_PERSIST, 'isolated local fixture required');
  const { signSession, COOKIE } = await import('../server/auth.js');
  const browser = await chromium.launch({ executablePath: process.env.CHROME });
  const context = async width => {
    const ctx = await browser.newContext({ viewport: { width, height: 900 }, timezoneId: 'Europe/Jersey' });
    await ctx.addCookies([{ name: COOKIE, value: await signSession('admin@example.test', vars.SESSION_SECRET),
      domain: new URL(BASE).hostname, path: '/', httpOnly: true, secure: true, sameSite: 'Strict' }]);
    return ctx;
  };
  const errors = [];
  const openRecord = async (ctx, name) => {
    const page = await ctx.newPage(); page.on('pageerror', e => errors.push(e.message)); page.setDefaultTimeout(10000);
    await page.goto(new URL('admin/#/advertisers', BASE).href);
    await page.getByRole('row').filter({ hasText: name }).getByRole('button', { name: 'Open' }).click();
    await page.getByRole('heading', { name: 'Advertiser details' }).waitFor();
    return page;
  };
  try { for (const [index, width] of [1280, 390].entries()) {
    const id = 9100 + index, secrets = seed(id, String(width)), [name] = secrets;
    const ctxA = await context(width), ctxB = await context(width);
    const a1 = await openRecord(ctxA, name), a2 = await openRecord(ctxA, name), b1 = await openRecord(ctxB, name);
    assert.deepEqual(await leaks(a1, secrets), secrets, 'fixture shows the data before removal');

    // Tab A2 asks for the record; its answer (with the old data) is held until after the removal.
    let release, seen; const gate = new Promise(r => { release = r; }), asked = new Promise(r => { seen = r; });
    const held = new RegExp(`/api/admin/advertisers/${id}$`);
    await a2.route(held, async route => { if (route.request().method() !== 'GET') return route.continue();
      const response = await route.fetch(); seen(); await gate; await route.fulfill({ response }); });
    await a2.getByRole('row').filter({ hasText: name }).getByRole('button', { name: 'Open' }).click(); await asked;

    // Confirmation step in A1, by keyboard.
    await a1.getByRole('button', { name: 'Review removal of personal data' }).click();
    const panel = a1.getByRole('group', { name: 'Remove personal data' });
    await panel.getByText("This removes the individual's name, 1 contact name, 1 email, 1 phone number. It cannot be undone.").waitFor();
    await panel.getByText('Emails waiting to be sent to these addresses: 1, cancelled with the removal.').waitFor();
    await panel.getByText('Received emails from or to these addresses: 1, kept until email retention removes them.').waitFor();
    await panel.getByText('This is not a complete removal', { exact: false }).waitFor();
    assert.equal(await a1.evaluate(() => document.activeElement?.id), 'removal-heading');
    const confirm = panel.getByRole('button', { name: 'Remove personal data permanently' });
    assert.equal(await confirm.isDisabled(), true, 'a reason is required');
    if (process.env.E2E_SHOTS) await panel.screenshot({ path: join(process.env.E2E_SHOTS, `age14-panel-${width}.png`) }).catch(() => {});
    await a1.keyboard.press('Tab'); await a1.keyboard.press('Space');
    assert.equal(await panel.getByLabel('No longer needed after review').isChecked(), true);
    await confirm.focus(); await a1.keyboard.press('Enter');
    await a1.getByRole('status').filter({ hasText: 'Personal data removed from the directory.' }).waitFor();
    await a1.getByText('Personal data was removed on', { exact: false }).waitFor();
    assert.deepEqual(await leaks(a1, secrets), []);
    assert.equal(await a1.getByRole('button', { name: 'Save advertiser' }).count(), 0);
    await a1.getByRole('row').filter({ hasText: 'Personal data removed' }).first().waitFor();

    // A2 learnt the ID by broadcast: the old record is hidden and the held answer is discarded when it arrives.
    await waitClean(a2, secrets);
    release(); await a2.getByRole('alert').filter({ hasText: 'That response was out of date and was discarded.' }).waitFor();
    assert.deepEqual(await leaks(a2, secrets), []);
    await a2.unroute(held);
    await a2.getByRole('button', { name: 'Reload record' }).click();
    await a2.getByText('Personal data was removed on', { exact: false }).waitFor();
    assert.deepEqual(await leaks(a2, secrets), []);

    // B never got the message (another browser context). A stale save is refused by the server...
    await b1.getByLabel('Name', { exact: true }).first().fill(`${name} edited`);
    await b1.getByRole('button', { name: 'Save advertiser' }).click();
    await b1.getByRole('alert').filter({ hasText: 'Personal data was removed from this record.' }).waitFor();
    // ...and going offline (1280) or a hidden tab (390) hides the record until the server confirms what is current.
    // Chromium's offline emulation updates navigator.onLine without firing the event, so the test dispatches it.
    const signal = (state, event) => b1.evaluate(([s, e]) => { Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => s });
      (e === 'visibilitychange' ? document : window).dispatchEvent(new Event(e)); }, [state, event]);
    if (width === 1280) { await ctxB.setOffline(true); await signal('visible', 'offline'); }
    else await signal('hidden', 'visibilitychange');
    await waitClean(b1, secrets);
    assert.equal(await b1.getByRole('button', { name: 'Save advertiser' }).count(), 0, 'no editing while unconfirmed');
    if (width === 1280) { await ctxB.setOffline(false); await signal('visible', 'online'); }
    else await signal('visible', 'visibilitychange');
    await b1.getByText('Personal data was removed from this record in another tab.').waitFor();
    await b1.getByText('Personal data was removed on', { exact: false }).waitFor();
    assert.deepEqual(await leaks(b1, secrets), []);

    // Reload with failing reads, then back navigation: never the old data.
    await a1.route('**/api/admin/advertisers**', route => route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"Temporarily unavailable"}' }));
    await a1.reload(); await a1.getByRole('alert').filter({ hasText: 'Temporarily unavailable' }).waitFor();
    assert.deepEqual(await leaks(a1, secrets), []);
    await a1.unroute('**/api/admin/advertisers**');
    await a1.reload(); await a1.getByRole('row').filter({ hasText: 'Personal data removed' }).first().waitFor();
    await a1.evaluate(() => { location.hash = '#/insights'; }); await a1.waitForURL('**/#/insights');
    await a1.goBack(); await a1.waitForURL('**/#/advertisers');
    await a1.getByRole('row').filter({ hasText: 'Personal data removed' }).first().waitFor();
    assert.deepEqual(await leaks(a1, secrets), []);
    const audit = execFileSync(process.execPath, [wrangler, 'd1', 'execute', 'hampton', '--local', '--persist-to', process.env.E2E_PERSIST, '--json',
      '--command', `SELECT (SELECT status FROM outbound WHERE ref='age14-${width}') AS mail, (SELECT reason FROM advertiser_suppressions WHERE advertiser_id=${id}) AS reason`]).toString();
    assert.deepEqual({ ...JSON.parse(audit)[0].results[0] }, { mail: 'cancelled', reason: 'no_longer_needed' });

    if (width === 1280) {
      // Conflict: the record changes after the review was shown.
      const other = seed(9200, 'c1280');
      await a1.reload(); await a1.getByRole('row').filter({ hasText: other[0] }).getByRole('button', { name: 'Open' }).click();
      await a1.getByRole('button', { name: 'Review removal of personal data' }).click();
      await a1.getByRole('group', { name: 'Remove personal data' }).waitFor();
      sql('UPDATE advertisers SET version = version + 1 WHERE id = 9200');
      await a1.getByLabel('The person asked for removal').check();
      await a1.getByRole('button', { name: 'Remove personal data permanently' }).click();
      const alert = a1.getByRole('alert').filter({ hasText: 'This record or its copies changed. Review the removal again.' });
      await alert.waitFor(); await a1.waitForFunction(() => document.activeElement?.getAttribute('role') === 'alert');
      assert.equal(await a1.getByRole('group', { name: 'Remove personal data' }).count(), 0);
      await a1.getByRole('button', { name: 'Review removal of personal data' }).waitFor();
    } else {
      await a1.getByRole('row').filter({ hasText: 'Personal data removed' }).first().getByRole('button', { name: 'Open' }).click();
      await a1.getByText('Personal data was removed on', { exact: false }).waitFor();
      await a1.evaluate(() => { document.documentElement.style.zoom = '2'; });
      const overflow = await a1.evaluate(() => ({ width: innerWidth, scroll: document.documentElement.scrollWidth }));
      assert.ok(overflow.scroll <= overflow.width + 1, `no page overflow at 200%: ${JSON.stringify(overflow)}`);
      await a1.evaluate(() => { document.documentElement.style.zoom = '1'; });
    }
    if (process.env.E2E_SHOTS) await a1.screenshot({ path: join(process.env.E2E_SHOTS, `age14-${width}.png`), fullPage: true }).catch(() => {});
    await ctxA.close(); await ctxB.close();
    console.log(`AGE-14 ${width}px: confirmation, held GET, lost event, stale save, 503 reload, back navigation passed.`);
  }
  assert.deepEqual(errors, []);
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
