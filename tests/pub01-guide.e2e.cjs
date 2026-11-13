const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { build } = require('esbuild');
const { chromium, webkit } = require(process.env.PW || 'playwright-core');
(async () => {
  assert.equal(process.env.HAMPTON_E2E_ISOLATED, '1');
  assert.equal(process.env.E2E_PRODUCTION_READONLY, '0');
  const bundle = await build({entryPoints:['tests/pub01-guide-harness.jsx'],bundle:true,write:false,platform:'browser',format:'iife',jsx:'automatic',loader:{'.css':'empty'}});
  const css=readFileSync('admin/src/styles.css','utf8');
  const browser=await (process.env.HAMPTON_E2E_BROWSER==='webkit'?webkit:chromium).launch({executablePath:process.env.CHROME});
  try { for (const width of [1280,390]) {
    const page=await browser.newPage({viewport:{width,height:900},reducedMotion:'reduce'}), errors=[], writes=[];
    page.on('pageerror',e=>errors.push(e.message));
    let conflict=true;
    let listing={id:'TEST-001',title:'Fixture listing',use:'residential',operation:'sale',availability:'for_sale',country:'Jersey',location:'St Helier',road_name:'Test Road',specs:[],feature_overrides:{},matchable:1,published:0,updated_at:'2026-11-13T12:00:00.000Z'};
    const details={building_name_or_number:'',postcode:'',property_condition:'',developer_name:'',public_address_snapshot:null};
    const data=()=>({listing,details,media:[],matched_applicants:[],sources:[],active_interest:0,research:null,issues:[],facts:[],terms:[],searches:[]});
    await page.route('**/api/**',async route=>{const url=new URL(route.request().url());const method=route.request().method();
      if(method==='GET'&&url.pathname==='/api/admin/listings/TEST-001')return route.fulfill({json:data()});
      if(method==='GET'&&url.pathname.endsWith('/offers'))return route.fulfill({json:{offers:[],open:0,sale:null}});
      if(method==='GET'&&url.pathname.endsWith('/history'))return route.fulfill({json:{items:[],next:null,listing:{state:'draft'}}});
      if(method==='PUT'&&url.pathname==='/api/admin/listings/TEST-001') {writes.push(method);if(conflict){conflict=false;return route.fulfill({status:409,json:{error:'Changed elsewhere',fields:{title:'Check title'}}});}
        const body=route.request().postDataJSON();listing={...listing,...body,updated_at:'2026-11-13T12:01:00.000Z'};return route.fulfill({json:{listing,details}});}
      if(method!=='GET')writes.push(method+' '+url.pathname);
      return route.fulfill({status:404,json:{error:'Not available in fixture'}});
    });
    await page.route('**/pub01-synthetic',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><html lang="en"><meta name="viewport" content="width=device-width, initial-scale=1"><div id="root"></div></html>'}));
    await page.goto(new URL('pub01-synthetic',process.env.BASE).href);await page.addStyleTag({content:css});await page.addScriptTag({content:bundle.outputFiles[0].text});
    await page.getByRole('heading',{name:'Property guide'}).waitFor();
    const title=page.getByLabel('Title',{exact:true});await title.fill('Unsaved fixture');
    await page.getByRole('button',{name:'Financial',exact:true}).click();assert.equal(await title.inputValue(),'Unsaved fixture');
    assert.equal(await page.locator('#h-price').evaluate(e=>document.activeElement===e),true);
    await page.getByRole('button',{name:'Legal',exact:true}).click();await page.getByText(/Additional legal fields are not available/).waitFor();
    await page.getByRole('button',{name:'Marketing',exact:true}).click();await page.getByRole('button',{name:'Go to Photos'}).click();
    assert.equal(await page.locator('#h-photos').evaluate(e=>document.activeElement===e),true);
    await page.getByRole('button',{name:'Review',exact:true}).click();await page.getByText(/Step 6 of 6/).waitFor();
    assert.deepEqual(writes,[]);
    await page.getByRole('button',{name:'Finish guide'}).click(); assert.deepEqual(writes,[]);
    await page.waitForFunction(() => document.activeElement?.textContent === 'Open property guide');
    await page.getByRole('button',{name:'Open property guide'}).click(); await page.getByRole('button',{name:'Review',exact:true}).click();
    await page.getByRole('button',{name:'Save',exact:true}).click();await page.getByText('Changed elsewhere').waitFor();
    await page.getByText(/Step 1 of 6/).waitFor();assert.equal(await title.inputValue(),'Unsaved fixture');
    await page.getByRole('button',{name:'Save',exact:true}).click();await page.getByText('Changes saved.').waitFor();
    assert.equal(await title.inputValue(),'Unsaved fixture');await title.fill('Discard me');await page.getByRole('button',{name:'Discard'}).click();assert.equal(await title.inputValue(),'Unsaved fixture');
    await page.evaluate(()=>{document.body.style.zoom='2'});assert.equal(await page.getByRole('heading',{name:'Property guide'}).isVisible(),true);
    assert.deepEqual(writes,['PUT','PUT']);assert.deepEqual(errors,[]);await page.close();
  }} finally {await browser.close();}
  console.log('PUB-01 guide synthetic editor navigation, save, conflict and mobile/zoom PASS');
})().catch(e=>{console.error(e);process.exitCode=1});
