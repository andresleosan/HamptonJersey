// Synthetic local data only; run exclusively with test:e2e:isolated.
const assert = require('node:assert/strict');
const { readFileSync, mkdirSync } = require('node:fs');
const { parseEnv } = require('node:util');
const { execFileSync } = require('node:child_process');
const { join, dirname } = require('node:path');
const { chromium } = require(process.env.PW || 'playwright-core');

(async () => {
  const base = new URL(process.env.BASE);
  assert.equal(base.protocol, 'https:');
  assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(base.hostname), 'local fixture only');
  assert.ok(process.env.E2E_PERSIST?.startsWith('/tmp/') && process.env.E2E_VARS?.startsWith('/tmp/'), 'disposable fixture required');
  const vars = parseEnv(readFileSync(process.env.E2E_VARS, 'utf8'));
  const { signSession, COOKIE } = await import('../server/auth.js');
  const wrangler = join(dirname(require.resolve('wrangler')), '..', 'bin', 'wrangler.js');
  const execute = command => execFileSync(process.execPath,
    [wrangler, 'd1', 'execute', 'hampton', '--local', '--persist-to', process.env.E2E_PERSIST, '--command', command],
    { stdio: 'pipe' });
  const shots = process.env.E2E_SHOTS || '/tmp/hampton-shots';
  mkdirSync(shots, { recursive: true });
  const browser = await chromium.launch({ executablePath: process.env.CHROME });
  try {
    for (const width of [1280, 390]) {
      const unknownId = `BUS12-${width}-UNKNOWN`, gbpId = `BUS12-${width}-GBP`;
      const unknownTitle = `Currency unknown ${width}`, gbpTitle = `Currency GBP ${width}`;
      execute(`UPDATE listings SET matchable=0;
        INSERT INTO listings(id,title,use,operation,availability,matchable,sale_price,currency,country,parish,published,created_at,updated_at,updated_by)
        VALUES('${unknownId}','${unknownTitle}','residential','sale','for_sale',1,1200000,NULL,'Jersey','St Helier',0,'2026-11-13','2026-11-13','fixture'),
              ('${gbpId}','${gbpTitle}','residential','sale','for_sale',1,900000,'GBP','Jersey','St Helier',0,'2026-11-13','2026-11-13','fixture');`);
      const context = await browser.newContext({ viewport: { width, height: 900 } });
      const errors = [];
      try {
        await context.addCookies([{ name: COOKIE, value: await signSession('admin@example.test', vars.SESSION_SECRET),
          domain: base.hostname, path: '/', httpOnly: true, secure: true, sameSite: 'Strict' }]);
        await context.route('https://fonts.googleapis.com/**', route => route.fulfill({ status: 200, contentType: 'text/css', body: '' }));
        const made = await context.request.post(new URL('api/admin/applicants', base).href, {
          headers: { origin: base.origin }, data: { name: `BUS12 fixture ${width}`, email: `bus12-${width}@example.test`,
            source: 'phone', operation: 'buy', budget_max: 1000000, area_answer: 'any', pets: [{kind:'none'}],
            requirement_priorities: { version:1, values:{budget:'must'}, unknown:[] } },
        });
        assert.equal(made.status(), 201, `synthetic applicant creation at ${width}`);
        const { id } = await made.json();
        const page = await context.newPage();
        page.on('pageerror', error => errors.push(error.message));
        await page.goto(new URL(`admin/#/applicants/${id}/matches`, base).href);
        const group = status => page.locator('.match-group').filter({ has: page.locator(`#group-${status}`) });
        const card = (status, title) => group(status).locator('article.match').filter({ has: page.getByRole('link', {name:title, exact:true}) });
        const budget = item => item.locator('dl.checks > div').filter({ has: page.locator('dt').filter({hasText:'Budget'}) });
        const unknown = card('found', unknownTitle), known = card('found', gbpTitle);
        await unknown.waitFor();
        await known.waitFor();
        await unknown.getByText('Requirements to confirm', {exact:true}).waitFor();
        assert.match(await budget(unknown).innerText(), /Budget.*Must-have[\s\S]*Unknown[\s\S]*Confirm the price currency/);
        assert.doesNotMatch(await budget(unknown).innerText(), /£/, 'an unknown currency must not acquire GBP budget evidence');
        assert.doesNotMatch(await unknown.locator('.match-price').innerText(), /£/, 'the displayed listing price must not acquire a GBP symbol');
        await known.getByText('Stated must-haves met', {exact:true}).waitFor();
        assert.match(await budget(known).innerText(), /Budget.*Must-have[\s\S]*Meets[\s\S]*£900,000/);

        // Navigate from the listing link to Shortlist with the keyboard, then keep that human decision through recalculation.
        const link = unknown.getByRole('link', {name:unknownTitle, exact:true});
        const shortlistButton = unknown.getByRole('button', {name:`Shortlist ${unknownTitle}`, exact:true});
        await link.focus();
        await page.keyboard.press('Tab');
        assert.equal(await shortlistButton.evaluate(el => el === document.activeElement), true);
        await page.keyboard.press('Enter');
        await page.getByText(`Shortlisted ${unknownTitle}.`, {exact:true}).waitFor();
        const shortlisted = card('shortlisted', unknownTitle);
        await shortlisted.getByText('Requirements to confirm', {exact:true}).waitFor();

        // A local fixture change makes the saved order stale and exposes the existing Recalculate button.
        execute(`UPDATE listings SET sale_price=850000 WHERE id='${gbpId}'`);
        await page.reload();
        const recalculate = page.getByRole('button', {name:'Recalculate matches', exact:true});
        await recalculate.waitFor();
        await recalculate.focus();
        assert.equal(await recalculate.evaluate(el => el === document.activeElement), true);
        await page.keyboard.press('Enter');
        await page.getByText('Matches recalculated.', {exact:true}).waitFor();
        await shortlisted.getByText('Requirements to confirm', {exact:true}).waitFor();
        assert.doesNotMatch(await budget(shortlisted).innerText(), /£/);
        await known.getByText('Stated must-haves met', {exact:true}).waitFor();
        assert.match(await budget(known).innerText(), /Meets[\s\S]*£850,000/);

        const result = await context.request.get(new URL(`api/admin/applicants/${id}/matches?status=shortlisted`, base).href);
        assert.equal(result.status(), 200);
        const saved = (await result.json()).matches.find(match => match.listing.id === unknownId);
        assert.equal(saved.status, 'shortlisted');
        assert.equal(saved.requirements_status, 'pending');
        assert.equal(saved.checks.find(check => check.key === 'budget').result, 'unknown');
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true,
          `no horizontal page overflow at ${width}px`);
        assert.deepEqual(errors, []);
        await page.screenshot({path:join(shots,`bus12-currency-${width}.png`),fullPage:true});
        console.log(`BUS-12 ${width}px: pending currency, GBP, keyboard and retained shortlist after recalculation passed.`);
      } finally { await context.close(); }
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
