const assert = require('node:assert/strict');
const fs = require('node:fs');
const { chromium, webkit } = require(process.env.PW || 'playwright-core');

(async () => {
  assert.equal(process.env.HAMPTON_E2E_ISOLATED, '1');
  assert.equal(process.env.E2E_PRODUCTION_READONLY, '0');
  const browser = await (process.env.HAMPTON_E2E_BROWSER === 'webkit' ? webkit : chromium).launch({ executablePath: process.env.CHROME });
  const team = [
    { name: 'Synthetic Agent A', role: 'Agent', office: '00000 000000', photo: '/assets/team/gilberto-franco.jpg' },
    { name: 'Synthetic Agent B', role: 'Agent', office: '00000 000000', photo: '/assets/team/joshua-franco.jpg' },
  ];
  const availability = { negotiators: team.map((t, i) => ({ id: i + 1, name: t.name, role: t.role })), days: [{ date: '2026-12-01', slots: { 1: [{ time: '10:00', booked: false }], 2: [{ time: '10:30', booked: false }] } }] };
  try {
    for (const width of [1280, 390]) for (const broken of [false, true]) {
      const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce' });
      const page = await context.newPage(); const wix = [];
      page.on('request', r => { if (new URL(r.url()).hostname === 'static.wixstatic.com') wix.push(r.url()); });
      await page.route('**/data/team.json', r => r.fulfill({ json: team }));
      await page.route('**/api/availability**', r => r.fulfill({ json: availability }));
      if (broken) await page.route('**/assets/team/*.jpg', r => r.abort());
      await page.goto(process.env.BASE);
      await page.locator('#team .agent').first().waitFor();
      await page.locator('#book-slot input[name=negotiator]').first().waitFor();
      assert.equal(await page.locator('#team .agent h3').count(), 2);
      assert.equal(await page.locator('#book-slot input[name=negotiator]').count(), 2);
      const selectors = ['#team .agent img', '#book-slot .agents img'];
      for (const selector of selectors) {
        const img = page.locator(selector).first(); await img.waitFor({ state: 'attached' });
        await img.evaluate(el => el.complete ? null : new Promise(resolve => { el.addEventListener('load', resolve, { once: true }); el.addEventListener('error', resolve, { once: true }); }));
        assert.equal(await img.evaluate(el => getComputedStyle(el).visibility), broken ? 'hidden' : 'visible');
        if (!broken) assert.ok(await img.evaluate(el => el.naturalWidth > 0));
      }
      const radio = page.locator('#book-slot input[name=negotiator]').first();
      await radio.focus();
      assert.equal(await radio.evaluate(el => document.activeElement === el), true);
      await page.evaluate(() => { document.body.style.zoom = '200%'; });
      assert.equal(await page.locator('#team .agent h3').count(), 2);
      assert.equal(await radio.count(), 1);
      await page.evaluate(() => { document.body.style.zoom = ''; });
      await page.goto(new URL('p/HE-R001', process.env.BASE).href);
      const detail = page.locator('.agent-mini img').first(); await detail.waitFor({ state: 'attached' });
      await detail.evaluate(el => el.complete ? null : new Promise(resolve => { el.addEventListener('load', resolve, { once: true }); el.addEventListener('error', resolve, { once: true }); }));
      assert.equal(await detail.evaluate(el => getComputedStyle(el).visibility), broken ? 'hidden' : 'visible');
      assert.ok(await page.locator('.agent-mini b').count());
      assert.ok(await page.locator('#detail-slot input[name=negotiator]').count());
      assert.deepEqual(wix, []);
      await context.close();
    }
    // A new HTML page can briefly coexist with a cached older lib.js; photos must fail closed,
    // while the rest of the site and booking controls remain usable.
    const context = await browser.newContext({ viewport: { width: 390, height: 900 } });
    const page = await context.newPage();
    const oldLib = fs.readFileSync('site/lib.js', 'utf8').replace(/^const safeTeamPhoto = .*;\n/m, '');
    await page.route('**/lib.js', r => r.fulfill({ status: 200, contentType: 'application/javascript', body: oldLib }));
    await page.route('**/data/team.json', r => r.fulfill({ json: team }));
    await page.route('**/api/availability**', r => r.fulfill({ json: availability }));
    await page.goto(process.env.BASE);
    await page.locator('#team .agent').first().waitFor();
    await page.locator('#book-slot input[name=negotiator]').first().waitFor();
    assert.equal(await page.locator('#team .agent h3').count(), 2);
    assert.equal(await page.locator('#team .agent img').count(), 0);
    assert.equal(await page.locator('#book-slot input[name=negotiator]').count(), 2);
    await context.close();
  } finally { await browser.close(); }
  console.log('PRE-16 local team photos: team, booking, detail, failed images, 1280/390 PASS');
})().catch(error => { console.error(error); process.exitCode = 1; });
