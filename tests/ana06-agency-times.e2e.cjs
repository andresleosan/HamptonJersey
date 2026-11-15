// ANA-06: Insights shows the median working time from an enquiry sent to the advertiser's first useful answer, with
// what is still waiting, and never which advertiser. At 1280 and 390 px.
// Run only through test:e2e:isolated with the synthetic local fixture (ANA06_AGENCY_TIMES_READY on in tests/run-e2e.cjs).
const { chromium } = require(process.env.PW || 'playwright-core');
const assert = require('node:assert/strict');
const { readFileSync, mkdirSync } = require('node:fs');
const { parseEnv } = require('node:util');
const { execFileSync } = require('node:child_process');
const { join, dirname } = require('node:path');

(async () => {
  assert.ok(process.env.BASE && process.env.E2E_PERSIST && process.env.E2E_VARS, 'isolated fixture required');
  const BASE = process.env.BASE;
  const vars = parseEnv(readFileSync(process.env.E2E_VARS, 'utf8'));
  const { signSession, COOKIE } = await import('../server/auth.js');
  const { workingSeconds } = await import('../server/working-time.js');
  const wrangler = join(dirname(require.resolve('wrangler')), '..', 'bin', 'wrangler.js');
  const d1 = command => execFileSync(process.execPath, [wrangler, 'd1', 'execute', 'hampton', '--local',
    '--persist-to', process.env.E2E_PERSIST, '--json', '--command', command], { stdio: 'pipe' });

  // The last Tuesday at least two days ago: sent at 10:00 UTC, answered at 13:00 UTC. A second enquiry still waits.
  const day = new Date(Date.now() - 2 * 864e5);
  while (day.getUTCDay() !== 2) day.setUTCDate(day.getUTCDate() - 1);
  const date = day.toISOString().slice(0, 10), sent = `${date}T10:00:00.000Z`, answered = `${date}T13:00:00.000Z`;
  const hours = workingSeconds(sent, answered) / 3600;
  d1(`INSERT INTO advertisers (name, kind, details, activity_on, created_at, updated_at, updated_by)
    VALUES ('Fictional Lettings E2E', 'agency', '{}', '${date}', '${sent}', '${sent}', 'e2e')`);
  const enquiry = (scope, status, outcome, at) => d1(`INSERT INTO consultations (kind, listing_id, operation, scope_key, status,
    advertiser_id, body, asks_availability, prepared_by, prepared_at, operation_id, sent_at, response_outcome, response_at)
    VALUES ('general', 'HE-R001', 'sale', '${scope}', '${status}', (SELECT MAX(id) FROM advertisers), 'Is it still available?', 1,
    'admin@example.test', '${sent}', 'e2e-${scope}', '${sent}', ${outcome ? `'${outcome}'` : 'NULL'}, ${at ? `'${at}'` : 'NULL'})`);
  enquiry('ana06-a', 'answered', 'available', answered);
  enquiry('ana06-b', 'sent', null, null);

  const browser = await chromium.launch({ executablePath: process.env.CHROME });
  const shots = process.env.E2E_SHOTS || '/tmp/hampton-shots'; mkdirSync(shots, { recursive: true });
  try {
    for (const width of [1280, 390]) {
      const ctx = await browser.newContext({ viewport: { width, height: 900 }, timezoneId: 'Europe/Jersey' });
      await ctx.addCookies([{ name: COOKIE, value: await signSession('admin@example.test', vars.SESSION_SECRET),
        domain: new URL(BASE).hostname, path: '/', httpOnly: true, secure: true, sameSite: 'Strict' }]);
      const page = await ctx.newPage(), errors = [];
      page.on('pageerror', e => errors.push(e.message));
      await page.route('https://fonts.googleapis.com/**', route => route.fulfill({ status: 200, contentType: 'text/css', body: '' }));
      page.setDefaultTimeout(15000);

      await page.goto(new URL('admin/#/insights', BASE).href);
      const block = page.locator('section[aria-labelledby="h-agency-times"]');
      await block.waitFor();
      assert.equal(await page.getByRole('heading', { name: 'Agency response times' }).count(), 1);
      const card = block.locator('.card');
      assert.equal((await card.locator('dt').innerText()).trim(), "Enquiry sent to the advertiser's first useful answer");
      assert.equal((await card.locator('dd.num').innerText()).trim(), `${hours} working hour${hours === 1 ? '' : 's'}`);
      assert.match(await card.innerText(), /Median of 1 case · 1 waiting/);
      assert.match(await block.innerText(), /Monday to Friday, 09:00 to 17:00 Jersey time, without Jersey bank holidays/);
      assert.ok(!(await page.locator('body').innerText()).includes('Fictional Lettings E2E'), 'no advertiser named');
      // The team's clock-time figures stay as they were.
      await page.getByRole('heading', { name: 'Team response times' }).waitFor();
      await block.screenshot({ path: join(shots, `ana06-agency-times-${width}.png`) });
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
      assert.ok(overflow <= 1, `no horizontal overflow at ${width}px`);
      assert.deepEqual(errors, []);
      await ctx.close();
      console.log(`ANA-06 ${width}px: ${hours} working hours, 1 case, 1 waiting, no advertiser named.`);
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
