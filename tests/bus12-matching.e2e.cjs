// Synthetic local data only: E2E_PRODUCTION_READONLY=0 E2E_SCRIPT=tests/bus12-matching.e2e.cjs npm run test:e2e:isolated
const assert = require('node:assert/strict');
const { readFileSync, mkdirSync } = require('node:fs');
const { parseEnv } = require('node:util');
const { execFileSync } = require('node:child_process');
const { join, dirname } = require('node:path');
const { chromium, webkit } = require(process.env.PW || 'playwright-core');

(async () => {
  assert.equal(process.env.HAMPTON_E2E_ISOLATED, '1'); assert.equal(process.env.E2E_PRODUCTION_READONLY, '0');
  const base = new URL(process.env.BASE.replace('127.0.0.1', 'localhost'));
  const vars = parseEnv(readFileSync(process.env.E2E_VARS, 'utf8'));
  const { signSession, COOKIE } = await import('../server/auth.js');
  const { extractFeatures } = await import('../server/listing-features.js');
  const wrangler = join(dirname(require.resolve('wrangler')), '..', 'bin', 'wrangler.js');
  const execute = command => execFileSync(process.execPath,
    [wrangler, 'd1', 'execute', 'hampton', '--local', '--persist-to', process.env.E2E_PERSIST, '--command', command], { stdio: 'pipe' });
  const shots = process.env.E2E_SHOTS; if (shots) mkdirSync(shots, { recursive: true });
  const sql = v => (v == null ? 'NULL' : typeof v === 'number' ? String(v) : `'${String(v).replaceAll("'", "''")}'`);
  // name, what the listing says, what differs from a favourable home, the badge its card must show (null: not offered).
  const HOMES = [
    ['Met', 'Parking for two cars. Pets allowed', {}, 'Stated must-haves met'],
    ['Housing unknown', 'Parking for two cars. Pets allowed', { housing_category: null }, 'Requirements to confirm'],
    ['Parking unknown', 'Pets allowed', {}, 'Requirements to confirm'],
    ['One space', 'Parking for one car. Pets allowed', {}, 'Alternative · requirements not met'],
    ['Over budget', 'Parking for two cars. Pets allowed', { rent: 2500 }, 'Alternative · requirements not met'],
    ['Excluded area', 'Parking for two cars. Pets allowed', { parish: 'Trinity' }, null],
    ['Not eligible', 'Parking for two cars. Pets allowed', { housing_category: 'qualified' }, null],
    ['No pets', 'Parking for two cars. No pets', {}, null],
  ];
  // A commercial search (rent up to £2,000 a month, 100 to 120 sq m, not in Trinity) against commercial listings.
  const UNITS = [
    ['Unit met', {}, 'Stated must-haves met'],
    ['Unit no area', { interior_area_sqft: null }, 'Requirements to confirm'],
    ['Unit euro', { currency: 'EUR' }, 'Requirements to confirm'],
    ['Unit over', { rent: 36000 }, 'Alternative · requirements not met'],
    ['Unit small', { interior_area_sqft: 500 }, 'Alternative · requirements not met'],
    ['Unit vetoed', { parish: 'Trinity' }, null],
    ['Business', { operation: 'business', availability: 'for_sale', premium: 50000 }, null],
  ];
  const browser = await (process.env.HAMPTON_E2E_BROWSER === 'webkit' ? webkit : chromium).launch({ executablePath: process.env.CHROME });
  try {
    for (const width of [1280, 390]) {
      const title = name => `BUS12 ${width} ${name}`;
      execute('UPDATE listings SET matchable=0;' + HOMES.map(([name, description, over], i) => {
        const row = { id: `BUS12M-${width}-${i}`, title: title(name), use: 'residential', operation: 'rent', availability: 'to_let', matchable: 1,
          rent: 1800, rent_period: 'month', currency: 'GBP', country: 'Jersey', bedrooms: 2, bathrooms: 2, housing_category: 'registered',
          published: 0, created_at: '2026-11-14', updated_at: '2026-11-14', updated_by: 'fixture',
          ...extractFeatures({ description }), parish: 'St Helier', ...over };
        return `INSERT INTO listings(${Object.keys(row)}) VALUES(${Object.values(row).map(sql)});`;
      }).join('') + UNITS.map(([name, over], i) => {
        const row = { id: `BUS12C-${width}-${i}`, title: title(name), use: 'commercial', operation: 'rent', availability: 'to_let', matchable: 1,
          rent: 24000, rent_period: 'year', currency: 'GBP', country: 'Jersey', parish: 'St Helier', interior_area_sqft: 1200,
          property_type: 'Office', published: 0, created_at: '2026-11-14', updated_at: '2026-11-14', updated_by: 'fixture', ...over };
        return `INSERT INTO listings(${Object.keys(row)}) VALUES(${Object.values(row).map(sql)});`;
      }).join(''));
      const context = await browser.newContext({ viewport: { width, height: 900 } });
      const errors = [];
      try {
        await context.addCookies([{ name: COOKIE, value: await signSession('admin@example.test', vars.SESSION_SECRET),
          domain: base.hostname, path: '/', httpOnly: true, secure: true, sameSite: 'Strict' }]);
        await context.route('https://fonts.googleapis.com/**', route => route.fulfill({ status: 200, contentType: 'text/css', body: '' }));
        const made = await context.request.post(new URL('api/admin/applicants', base).href, { headers: { origin: base.origin },
          data: { name: `BUS12 matching ${width}`, email: `bus12-matching-${width}@example.test`, source: 'phone', operation: 'rent',
            budget_max: 2000, bedrooms_min: 2, parking_spaces: 2, pets: [{ kind: 'dog', count: 1 }], housing_status: 'entitled_work_only',
            parishes_excluded: ['Trinity'],
            requirement_priorities: { version: 1, values: { budget: 'must', bedrooms: 'must', parking: 'must', pets: 'must' }, unknown: [] } } });
        assert.equal(made.status(), 201, await made.text());
        const { id } = await made.json();
        const page = await context.newPage();
        page.on('pageerror', error => errors.push(error.message));
        await page.goto(new URL(`admin/#/applicants/${id}/matches`, base).href);
        const found = page.locator('.match-group').filter({ has: page.locator('#group-found') }).locator('article.match');
        const offered = HOMES.filter(home => home[3]);
        await found.nth(offered.length - 1).waitFor();
        // Met first, then what needs confirming, then the alternatives; excluded homes are not proposed.
        assert.deepEqual(await found.locator('h3').allInnerTexts(), offered.map(([name]) => title(name)));
        assert.deepEqual(await found.locator('.criteria-summary').allInnerTexts(), offered.map(home => home[3]));
        const row = (name, label) => found.filter({ has: page.getByRole('link', { name: title(name), exact: true }) })
          .locator('dl.checks > div').filter({ has: page.locator('dt').filter({ hasText: label }) }).innerText();
        assert.match(await row('Met', 'Parking'), /Must-have[\s\S]*Meets/);
        assert.match(await row('Housing unknown', 'Housing'), /Unknown[\s\S]*Housing category not given/);
        assert.match(await row('Parking unknown', 'Parking'), /Must-have[\s\S]*Unknown[\s\S]*Needs confirmation/);
        assert.match(await row('One space', 'Parking'), /Must-have[\s\S]*Fails[\s\S]*Must-have not met/);
        assert.match(await row('Over budget', 'Budget'), /Must-have[\s\S]*Fails[\s\S]*over £2,000/);
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1), `no sideways scroll at ${width}`);
        if (shots) await page.screenshot({ path: join(shots, `bus12-matching-${width}.png`), fullPage: true });

        const trader = await context.request.post(new URL('api/admin/applicants', base).href, { headers: { origin: base.origin },
          data: { name: `BUS12 trader ${width}`, email: `bus12-trader-${width}@example.test`, source: 'phone', search_category: 'commercial',
            operation: 'rent', commercial_kind: 'property', commercial_rent: 2000, commercial_rent_period: 'month', area_min: 100, area_max: 120,
            area_unit: 'sqm', parishes_excluded: ['Trinity'] } });
        assert.equal(trader.status(), 201, await trader.text());
        await page.goto(new URL(`admin/#/applicants/${(await trader.json()).id}/matches`, base).href);
        const units = UNITS.filter(unit => unit[2]);
        await found.nth(units.length - 1).waitFor();
        await page.getByRole('link', { name: title('Unit met'), exact: true }).waitFor();
        assert.deepEqual(await found.locator('h3').allInnerTexts(), units.map(([name]) => title(name)));
        assert.deepEqual(await found.locator('.criteria-summary').allInnerTexts(), units.map(unit => unit[2]));
        assert.equal(await page.getByText('Commercial matching is not available yet').count(), 0);
        assert.match(await row('Unit met', 'Rent'), /Must-have[\s\S]*Meets[\s\S]*£24,000 a year/);
        assert.match(await row('Unit met', 'Floor area'), /Meets[\s\S]*1,200 sq ft \(111\.5 sq m\)/);
        assert.match(await row('Unit no area', 'Floor area'), /Unknown[\s\S]*Needs confirmation/);
        assert.match(await row('Unit euro', 'Rent'), /Unknown[\s\S]*Confirm whether the EUR price fits the GBP budget/);
        assert.match(await row('Unit over', 'Rent'), /Fails[\s\S]*£36,000 a year, over £2,000 a month/);
        assert.match(await row('Unit small', 'Floor area'), /Fails[\s\S]*500 sq ft/);
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1), `no sideways scroll, commercial at ${width}`);
        if (shots) await page.screenshot({ path: join(shots, `bus12-commercial-${width}.png`), fullPage: true });
        assert.deepEqual(errors, []);
      } finally { await context.close(); }
    }
    console.log('BUS12 matching 1280 and 390: met, unknown, alternative and excluded stay apart, for homes and for commercial searches.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
