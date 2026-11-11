// Local fixture only: E2E_SCRIPT=tests/listing-completeness.e2e.cjs npm run test:e2e
const { chromium } = require(process.env.PW || 'playwright-core');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { parseEnv } = require('node:util');
const BASE = process.env.BASE, vars = parseEnv(readFileSync(process.env.E2E_VARS, 'utf8'));
(async () => {
  assert.ok(BASE && process.env.E2E_PERSIST, 'isolated local fixture required');
  const { signSession, COOKIE } = await import('../server/auth.js');
  const browser = await chromium.launch({executablePath: process.env.CHROME});
  try {
    for (const width of [1280,390]) {
      const context = await browser.newContext({viewport:{width,height:900},reducedMotion:'reduce'});
      await context.addCookies([{name:COOKIE,value:await signSession('admin@example.test',vars.SESSION_SECRET),domain:new URL(BASE).hostname,path:'/',secure:true,httpOnly:true,sameSite:'Strict'}]);
      const page = await context.newPage(), errors=[];
      page.on('pageerror', e => errors.push(e.message));
      await page.goto(BASE + 'admin/#/p/HE-R005');
      await page.locator('#f-summary').waitFor();
      const panel = page.locator('.prepub'), summary = page.locator('#f-summary');
      await summary.fill('');
      const missing = panel.getByRole('button',{name:'Add a summary'});
      await missing.waitFor();
      const before = Number((await panel.locator('strong').textContent()).match(/\d+/)[0]);
      await missing.focus(); await page.keyboard.press('Enter');
      assert.equal(await page.evaluate(() => document.activeElement.id), 'f-summary');
      await summary.fill('A clear description of this listing');
      await missing.waitFor({state:'detached'});
      const after = Number((await panel.locator('strong').textContent()).match(/\d+/)[0]);
      assert.ok(after > before, 'percentage responds to unsaved edits');
      await panel.getByText(/Based on current edits and saved photos/).waitFor();
      await panel.getByText(/You do not need 100% to publish/).waitFor();
      await page.route('**/api/admin/listings/HE-R005', route => route.fulfill({status:409,contentType:'application/json',body:JSON.stringify({error:'Fixture conflict'})}), {times:1});
      await page.getByRole('button',{name:'Save',exact:true}).click();
      await page.getByRole('alert').filter({hasText:'Fixture conflict'}).waitFor();
      assert.equal(await summary.inputValue(), 'A clear description of this listing');
      assert.equal(Number((await panel.locator('strong').textContent()).match(/\d+/)[0]), after);
      await page.evaluate(() => {document.documentElement.style.zoom = '2';});
      const overflow=await page.evaluate(() => ({viewport:document.documentElement.clientWidth,width:document.documentElement.scrollWidth}));
      assert.ok(overflow.width <= overflow.viewport + 1, JSON.stringify(overflow));
      assert.deepEqual(errors,[]);
      const incomplete = await context.newPage();
      await incomplete.route('**/api/admin/listings/HE-R005', async route => {
        const response=await route.fetch(), data=await response.json(); data.media=null;
        await route.fulfill({response,json:data});
      });
      await incomplete.goto(BASE + 'admin/#/p/HE-R005');
      await incomplete.getByRole('alert').filter({hasText:'Listing photos could not be loaded'}).waitFor();
      assert.equal(await incomplete.locator('.prepub').count(),0, 'unknown media never produces a percentage');
      await incomplete.close();
      console.log(`PUB-12 ${width}: live percentage, focus, conflict and 200% CSS zoom PASS`);
      await context.close();
    }
  } finally {await browser.close();}
})().catch(error => {console.error(error); process.exitCode=1;});
