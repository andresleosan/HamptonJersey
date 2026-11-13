// Public, anonymous production smoke test. All browser requests are limited to GET/HEAD on the fixed site.
const assert = require('node:assert/strict');
const ORIGIN = 'https://www.hamptonestatesjersey.com';
// Only the static files and public queries needed by this particular journey.
const SAFE_PATHS = new Set(['/', '/favicon.ico', '/requirements.css', '/lib.js', '/measurement-dimensions.js', '/apply.js',
  '/requirements.js', '/data/team.json', '/api/listings', '/api/config', '/api/tours',
  '/api/applicants/options']);
function permitsRequest(method, rawUrl) {
  try {
    const url = new URL(rawUrl);
    return url.origin === ORIGIN && !url.username && !url.password && !url.search && SAFE_PATHS.has(url.pathname)
      && ['GET','HEAD'].includes(method);
  } catch { return false; }
}
module.exports = {permitsRequest};

if (require.main === module) (async () => {
  const {webkit} = require('../playwright-core');
  const {browsers} = require('../playwright-core/browsers.json');
  const revision = browsers.find(browser => browser.name === 'webkit')?.revision;
  if (!revision) throw new Error('Matching WebKit revision not found');
  const browser = await webkit.launch({headless:false, executablePath:`/work/webkit-${revision}/pw_run.sh`,
    env:{...process.env, WEBKIT_FORCE_SANDBOX:'1'}});
  let blocked = 0;
  try {
    for (const width of [1280, 390]) {
      // No saved login, no service workers, and ordinary certificate verification remains enabled.
      const ctx = await browser.newContext({viewport:{width,height:width===390?844:800}, serviceWorkers:'block'});
      await ctx.routeWebSocket('**/*', ws => ws.close());
      await ctx.route('**/*', async route => {
        const request = route.request(), url = new URL(request.url());
        if (!permitsRequest(request.method(), url.href)) {
          blocked++; return route.abort();
        }
        // Do not follow redirects through an unexamined host.
        try {
          const response = await route.fetch({maxRedirects:0});
          if (response.status() >= 300 && response.status() < 400) { blocked++; return route.abort(); }
          await route.fulfill({response});
        } catch { await route.abort(); }
      });
      const page = await ctx.newPage();
      try {
        const home = await page.goto(ORIGIN + '/', {waitUntil:'domcontentloaded', timeout:30000});
        assert.equal(home?.status(), 200, 'public homepage responds');
        await page.locator('#main-nav').waitFor({state:'attached'});
        await page.locator('#app').waitFor({state:'visible'});
        assert.equal(new URL(page.url()).origin, ORIGIN);
        await page.goto(ORIGIN + '/#/apply', {waitUntil:'domcontentloaded', timeout:30000});
        const form = page.locator('.apply form'); await form.waitFor();
        await form.locator('[name=search_category][value=residential] + span').click();
        await form.locator('[name=operation][value=rent] + span').click();
        await form.locator('button[type=submit]').click();
        const areaAnswers = await form.locator('[name=area_answer]').count();
        if (process.env.E2E_PROD_EXPECT_REG06 === '1') assert.equal(areaAnswers, 3, 'deployed area answers');
        if (process.env.E2E_PROD_EXPECT_REG07 === '1') {
          const choose = (name, value) => form.locator(`input[name="${name}"][value="${value}"] + span`).click();
          await choose('area_answer','any');await form.locator('button[type=submit]').click();
          await choose('bedrooms_min','2');await form.locator('button[type=submit]').click();
          await choose('parking_spaces','unknown');await choose('pets','dog');
          assert.equal(await form.locator('[data-pets-mandatory]').isVisible(),true,'declared pets are essential');
          assert.equal(await form.locator('[aria-label="Pets must-have"]').count(),0,'pet priority cannot be downgraded');
        }
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true,
          `no horizontal overflow at ${width}px`);
        console.log(`Production public smoke ${width}: passed; REG-06 choices visible: ${areaAnswers === 3}; REG-07 interface checked without submission: ${process.env.E2E_PROD_EXPECT_REG07 === '1'}`);
      } finally { await ctx.close(); }
    }
    console.log(`Requests blocked by read-only browser policy: ${blocked}`);
  } finally { await browser.close(); }
})().catch(error => { console.error(`${error.name}: ${error.message}`); process.exitCode=1; });
