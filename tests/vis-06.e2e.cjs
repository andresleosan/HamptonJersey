const {chromium} = require(process.env.PW || 'playwright-core');
const assert = require('node:assert/strict');
(async () => {
  const browser = await chromium.launch();
  try {
    for (const width of [1280,390]) {
      const page = await browser.newPage({viewport:{width,height:900}});
      let count = 2, fail = false;
      await page.route('**/api/availability?*', async route => {
        if (fail) return route.fulfill({status:503, body:'unavailable'});
        const response = await route.fetch();
        const data = await response.json();
        data.confirmed_viewings_this_week = count;
        return route.fulfill({response,json:data});
      });
      await page.addInitScript(() => { const original=window.setTimeout; window.setTimeout=(fn,ms,...args)=>original(fn,ms===60000 ? 900 : ms,...args); });
      await page.goto(process.env.BASE+'p/HE-R001');
      const summary=page.locator('#detail-slot [data-viewing-summary]');
      await summary.waitFor();
      await page.waitForFunction(() => document.querySelector('#detail-slot [data-viewing-summary]')?.textContent.includes('2 confirmed'));
      assert.equal(await summary.textContent(),'2 confirmed viewings this week');
      assert.equal(await summary.getAttribute('role'),'status');
      count=3; await page.waitForFunction(() => document.querySelector('#detail-slot [data-viewing-summary]')?.textContent.includes('3 confirmed'));
      const prop=page.locator('#detail-slot select[name=prop]');
      count=1; await prop.selectOption(''); await prop.selectOption('HE-R001');
      await page.waitForTimeout(400); assert.equal(await summary.textContent(),'');
      fail=true; await prop.selectOption(''); await prop.selectOption('HE-R001');
      await page.waitForTimeout(400); assert.equal(await summary.textContent(),'');
      await prop.focus(); assert.equal(await prop.evaluate(el=>el===document.activeElement),true);
      console.log(`VIS-06 ${width}: count, privacy threshold, error and keyboard PASS`);
      await page.close();
    }
  } finally {await browser.close();}
})().catch(error => {console.error(error);process.exitCode=1;});
