// Synthetic responses to the actual component API; run only in the isolated fixture.
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { build } = require('esbuild');
const { chromium, webkit } = require(process.env.PW || 'playwright-core');
(async () => {
  assert.equal(process.env.HAMPTON_E2E_ISOLATED, '1');
  assert.equal(process.env.E2E_PRODUCTION_READONLY, '0');
  const bundle = await build({entryPoints:['tests/bus06-coverage-harness.jsx'],bundle:true,write:false,platform:'browser',format:'iife',jsx:'automatic'});
  const css=readFileSync('admin/src/styles.css','utf8');
  const browser=await (process.env.HAMPTON_E2E_BROWSER==='webkit'?webkit:chromium).launch({executablePath:process.env.CHROME});
  const id='11111111-1111-4111-8111-111111111111', cursor='0123456789abcdef0123456789abcdef';
  try {
    for (const width of [1280,390]) {
      const page=await browser.newPage({viewport:{width,height:900},reducedMotion:'reduce'}), errors=[];
      page.on('pageerror', e=>errors.push(e.message));
      let mode='unavailable', coverageCalls=0;
      await page.route('**/api/admin/market/**',async route=>{
        const u=new URL(route.request().url());
        if (mode==='unavailable') return route.fulfill({status:404,json:{error:'Not found'}});
        if (mode==='error') return route.fulfill({status:500,json:{error:'fixture'}});
        if (u.pathname.endsWith('/coverage')) {
          coverageCalls++;
          const after=u.searchParams.get('after');
          return route.fulfill({json:{run:{id,kind:'own_pilot',status:'paused'},overall:{scope:'own_pilot',external_coverage:'unknown'},
            sources:after?[]:[{source_ref:'source-fixture',channel_id:'example',status:'pending',access_status:'manual_only',method:'manual',review_due_at:null,last_capture_at:null,last_full_pass_at:null}],next:after?null:cursor}});
        }
        return route.fulfill({json:{runs:u.searchParams.has('after')?[]:[{id,kind:'own_pilot',status:'paused',created_at:'2026-11-13T10:00:00Z'}],next:u.searchParams.has('after')?null:id}});
      });
      await page.route('**/bus06-synthetic', route => route.fulfill({contentType:'text/html',body:'<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><div id="root"></div></body></html>'}));
      await page.goto(new URL('bus06-synthetic', process.env.BASE).href);
      await page.addStyleTag({content:css}); await page.addScriptTag({content:bundle.outputFiles[0].text});
      await page.getByText('Market inventory is not available yet.').waitFor();
      mode='error'; await page.reload();
      // Reload resets the component harness; mount again using the same isolated origin.
      await page.addStyleTag({content:css}); await page.addScriptTag({content:bundle.outputFiles[0].text});
      await page.getByText("Couldn't load market inventory. Please try again.").waitFor();
      mode='ok'; const retry=page.getByRole('button',{name:'Try again'}); await retry.focus(); await page.keyboard.press('Enter');
      await page.getByText(/Internal pilot · Paused/).waitFor();
      const show=page.getByRole('button',{name:'Show coverage'}); await show.focus(); await page.keyboard.press('Enter');
      await page.getByText('Unknown',{exact:true}).waitFor();
      assert.match(await page.getByRole('region',{name:'Source coverage'}).innerText(),/Access Manual only.*Method: Manual.*Review due: Not recorded.*Last capture: Not recorded.*Last full pass: Not recorded/s);
      // Exercise reflow with populated runs, source details and pagination controls present.
      await page.evaluate(()=>{document.body.style.zoom='2'});
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth+1),'populated coverage has no horizontal overflow at 200%');
      const controls=page.getByRole('group',{name:'Source coverage pages'});
      assert.equal(await controls.getByRole('button',{name:'Next page'}).isVisible(),true);
      await controls.getByRole('button',{name:'Next page'}).click();
      await page.getByText('No sources recorded on this page.').waitFor(); assert.equal(coverageCalls,2);
      await controls.getByRole('button',{name:'Previous page'}).click(); await page.getByText('source-fixture').waitFor();
      const runControls=page.getByRole('group',{name:'Inventory run pages'}); await runControls.getByRole('button',{name:'Next page'}).click();
      await page.getByText('No inventory runs recorded on this page. External coverage is unknown.').waitFor();
      await page.evaluate(()=>{document.body.style.zoom='2'});
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth+1),'no horizontal overflow at 200%');
      assert.deepEqual(errors,[]); await page.close();
    }
  } finally { await browser.close(); }
  console.log('BUS-06 coverage synthetic harness: unavailable, error/retry, keyboard, pagination, unknown, 1280/390 and 200% PASS');
})().catch(error=>{console.error(error);process.exitCode=1;});
