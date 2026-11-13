const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { build } = require('esbuild');
const { chromium, webkit } = require(process.env.PW || 'playwright-core');
(async () => {
  assert.equal(process.env.HAMPTON_E2E_ISOLATED,'1'); assert.equal(process.env.E2E_PRODUCTION_READONLY,'0');
  const bundle = await build({entryPoints:['tests/bus19-source-review-harness.jsx'],bundle:true,write:false,platform:'browser',format:'iife',jsx:'automatic'});
  const css=readFileSync('admin/src/styles.css','utf8');
  const browser=await (process.env.HAMPTON_E2E_BROWSER==='webkit'?webkit:chromium).launch({executablePath:process.env.CHROME});
  try { for (const width of [1280,390]) {
    const page=await browser.newPage({viewport:{width,height:900},reducedMotion:'reduce'}), errors=[]; page.on('pageerror',e=>errors.push(e.message));
    let mode='unavailable', attempt=0, posted=[], detailVersion=1, detailStatus='pending';
    await page.route('**/api/admin/market/sources**', async route=>{
      const url=new URL(route.request().url());
      if (mode==='unavailable') return route.fulfill({status:404,json:{error:'Not found'}});
      if (url.pathname.endsWith('/review')) { posted.push(route.request().postDataJSON()); attempt++; if(attempt===1) return route.fulfill({status:409,json:{error:'changed'}}); if(attempt===2) return route.abort(); return route.fulfill({json:{decision:{},recorded_version:2}}); }
      if (url.pathname.endsWith('/detail')) return route.fulfill({json:{decision:{source_ref:'fixture',channel_id:'web',version:detailVersion,status:detailStatus,method:detailStatus === 'allowed' ? 'manual' : null,allowed_hosts:[],allowed_paths:[],allowed_redirect_hosts:[],min_interval_s:60,checked_at:null,review_due_at:null,evidence_ref:null,retention_ref:null}}});
      return route.fulfill({json:{sources:url.searchParams.has('after')?[]:[{source_ref:'fixture',channel_id:'web',status:'pending',method:null,checked_at:null,review_due_at:null}],next:url.searchParams.has('after')?null:'nextfixture'}});
    });
    await page.route('**/bus19-synthetic',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><div id="root"></div></body></html>'}));
    await page.goto(new URL('bus19-synthetic',process.env.BASE).href); await page.addStyleTag({content:css}); await page.addScriptTag({content:bundle.outputFiles[0].text});
    await page.getByText('Source review is not available yet.').waitFor(); mode='ok'; await page.reload(); await page.addStyleTag({content:css}); await page.addScriptTag({content:bundle.outputFiles[0].text});
    await page.getByText(/fixture · web · Pending review/).waitFor();
    const button=page.getByRole('button',{name:'Review fixture web'}); await button.focus(); await page.keyboard.press('Enter');
    await page.getByText(/Current: Pending review/).waitFor();
    await page.evaluate(()=>{document.body.style.zoom='2'}); assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth+1),'no overflow at 200%');
    await page.getByRole('button',{name:'Save review'}).click(); await page.getByText(/This review changed/).waitFor();
    assert.equal(await page.getByRole('button',{name:'Save review'}).isDisabled(),true);
    await page.getByRole('button',{name:'Reload review'}).click(); await page.getByText(/Current: Pending review/).waitFor();
    await page.getByRole('button',{name:'Save review'}).click(); await page.getByText(/save result is unknown/i).waitFor();
    assert.equal(await page.getByLabel('Decision').isDisabled(),true);
    await page.getByRole('button',{name:'Retry same save'}).click(); await page.getByText(/fixture · web · Pending review/).waitFor();
    assert.equal(posted[1].operation_id,posted[2].operation_id); assert.equal(posted[1].version,1); assert.equal(posted[1].status,'pending');
    await page.getByRole('button',{name:'Next page'}).click(); await page.getByText('No source channels recorded on this page.').waitFor();
    await page.getByRole('button',{name:'Previous page'}).click(); await page.getByText(/fixture · web · Pending review/).waitFor();
    await page.getByRole('button',{name:'Review fixture web'}).click(); await page.getByText(/Current: Pending review/).waitFor();
    await page.getByLabel('Evidence reference').fill('local-edit'); detailVersion=2; detailStatus='denied';
    await page.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));
    await page.getByText(/Your edits are preserved/).waitFor(); assert.equal(await page.getByLabel('Evidence reference').inputValue(),'local-edit');
    assert.equal(await page.getByRole('button',{name:'Save review'}).isDisabled(),true);
    detailStatus='allowed'; await page.getByRole('button',{name:'Reload current decision'}).click(); await page.getByText(/Current: Allowed/).waitFor();
    detailStatus='pending'; await page.evaluate(()=>document.dispatchEvent(new Event('visibilitychange'))); await page.getByText(/Your edits are preserved/).waitFor();
    assert.equal(await page.getByRole('button',{name:'Save review'}).isDisabled(),true);
    assert.deepEqual(errors,[]); await page.close();
  } } finally { await browser.close(); }
  console.log('BUS-19 source review synthetic harness: gate, keyboard, unknown, 409, uncertain retry, pagination, 390/1280 and zoom PASS');
})().catch(e=>{console.error(e);process.exitCode=1;});
