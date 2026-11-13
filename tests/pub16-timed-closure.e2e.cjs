// Synthetic local-only fixture; execute exclusively with test:e2e:isolated.
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PW || 'playwright-core');
const { mkdtempSync, readFileSync, writeFileSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join, dirname } = require('node:path');
const { parseEnv } = require('node:util');
const { execFileSync } = require('node:child_process');
const { startFixture } = require('./serve-e2e.cjs');

(async () => {
  assert.equal(process.env.HAMPTON_E2E_ISOLATED, '1');
  assert.equal(process.env.E2E_PRODUCTION_READONLY, '0');
  assert.ok(process.env.E2E_PERSIST?.startsWith('/tmp/') && process.env.E2E_VARS?.startsWith('/tmp/'));
  const temporary = mkdtempSync(join(tmpdir(), 'pub16-browser-'));
  const varsFile = join(temporary, 'fixture.vars');
  writeFileSync(varsFile, readFileSync(process.env.E2E_VARS, 'utf8') + '\nPUB16_TIMED_CLOSURE_READY=1\n', { mode: 0o600 });
  const vars = parseEnv(readFileSync(varsFile, 'utf8'));
  const wrangler = join(dirname(require.resolve('wrangler')), '..', 'bin', 'wrangler.js');
  const execute = args => execFileSync(process.execPath, [wrangler, 'd1', 'execute', 'hampton', '--local',
    '--persist-to', process.env.E2E_PERSIST, ...args], { stdio: 'pipe' });
  const sql = statement => execute(['--command', statement]);
  const { signSession, COOKIE } = await import('../server/auth.js');
  let server, browser;
  try {
    execute(['--file', 'docs/roadmap/work/PUB-16/rental-closure.proposed.sql']);
    server = await startFixture({ persist: process.env.E2E_PERSIST, varsFile, port: 0 });
    const base = server.url;
    assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(base.hostname));
    browser = await chromium.launch({ executablePath: process.env.CHROME });
    for (const width of [1280, 390]) {
      sql(`DELETE FROM rental_closure_windows WHERE listing_id='HE-R002';
        UPDATE listings SET operation='rent',availability='to_let',published=1,archived_at=NULL,
          updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id='HE-R002';
        INSERT OR IGNORE INTO research_sources(source_id,property_id,title)
          VALUES('PUB16-EVIDENCE','HE-R002','Synthetic rental evidence');`);
      const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce' });
      const anonymous = await browser.newContext({ viewport: { width, height: 900 } });
      const errors = [];
      try {
        await context.addCookies([{ name: COOKIE, value: await signSession('admin@example.test', vars.SESSION_SECRET),
          domain: base.hostname, path: '/', secure: true, httpOnly: true, sameSite: 'Strict' }]);
        const page = await context.newPage();
        page.on('pageerror', error => errors.push(error.message));
        await page.goto(new URL('admin/#/p/HE-R002', base).href);
        const form = page.locator('section[aria-labelledby="h-rental-marketing"]');
        const day = new Date().toISOString().slice(0, 10);
        await form.getByLabel('Marketing action').selectOption('let');
        await form.getByLabel('Date of confirmation').fill(day);
        await form.getByLabel('Recorded evidence').selectOption('source:PUB16-EVIDENCE');
        const submit = form.getByRole('button', { name: 'Record marketing state', exact: true });
        await submit.focus();
        await page.keyboard.press('Enter');
        await page.getByRole('status').filter({ hasText: 'Rental marketing state recorded.' }).waitFor();
        await form.locator('strong').filter({ hasText: 'Let agreed' }).waitFor();
        let response = await anonymous.request.get(new URL('api/listings', base).href);
        assert.equal(response.headers()['cache-control'], 'no-store');
        assert.equal((await response.json()).find(x => x.id === 'HE-R002').status, 'Let agreed');
        assert.equal((await anonymous.request.get(new URL('api/availability?listing_id=HE-R002', base).href)).status(), 404);

        await form.getByLabel('Marketing action').selectOption('return_to_market');
        await form.getByLabel('Reason').selectOption('correction');
        await form.getByLabel('Date of confirmation').fill(day);
        await form.getByLabel('Recorded evidence').selectOption('source:PUB16-EVIDENCE');
        const [correction] = await Promise.all([
          page.waitForResponse(r => r.url().includes('/rental-marketing') && r.request().method() === 'POST'),
          submit.click(),
        ]);
        if (correction.status() !== 200) {
          const body = await correction.json();
          throw new Error(`Correction returned ${correction.status()}: ${body.error || 'no error detail'}`);
        }
        await form.locator('strong').filter({ hasText: 'To let' }).waitFor();
        response = await anonymous.request.get(new URL('api/listings', base).href);
        assert.ok((await response.json()).some(x => x.id === 'HE-R002' && x.status !== 'Let agreed'));
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));

        // Insert an already-expired synthetic window: this is a boundary fixture, not a 24-hour real-time wait.
        sql(`UPDATE listings SET availability='let_agreed',published=1 WHERE id='HE-R002';
          INSERT INTO rental_closure_windows(closure_id,listing_id,close_event_id,state,opened_at,due_at,
            previous_availability,previous_published,previous_viewings_enabled,previous_confirmed_at,applied_confirmed_at,applied_updated_at)
          SELECT 'expired-${width}',l.id,(SELECT id FROM events WHERE entity_type='listing' AND entity_id=l.id ORDER BY id DESC LIMIT 1),'open',
            strftime('%Y-%m-%dT%H:%M:%fZ','now','-48 hours'),strftime('%Y-%m-%dT%H:%M:%fZ','now','-24 hours'),
            'to_let',1,COALESCE(l.viewings_enabled,0),NULL,l.confirmed_at,l.updated_at FROM listings l WHERE l.id='HE-R002';`);
        response = await anonymous.request.get(new URL('api/listings', base).href);
        assert.ok(!(await response.json()).some(x => x.id === 'HE-R002'));
        const publicPage = await anonymous.newPage();
        const pageResponse = await publicPage.goto(new URL('p/HE-R002', base).href);
        assert.equal(pageResponse.status(), 404);
        assert.ok(!(await publicPage.locator('body').innerText()).includes('Trinity rental'));
        assert.deepEqual(errors, []);
        console.log(`PUB-16 ${width}px: correction and expired public visibility passed.`);
      } finally {
        await anonymous.close();
        await context.close();
      }
    }
  } finally {
    if (browser) await browser.close();
    if (server) await server.close();
    rmSync(temporary, { recursive: true, force: true });
  }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
