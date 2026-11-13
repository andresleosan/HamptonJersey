const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const {build}=require('esbuild');
const {chromium,webkit}=require(process.env.PW||'playwright-core');
(async()=>{
 assert.equal(process.env.HAMPTON_E2E_ISOLATED,'1');assert.equal(process.env.E2E_PRODUCTION_READONLY,'0');
 const bundle=async path=>(await build({entryPoints:[path],bundle:true,write:false,platform:'browser',format:'iife',jsx:'automatic'})).outputFiles[0].text;
 const [admin,publicCode]=await Promise.all([bundle('tests/pub19-admin-harness.jsx'),bundle('tests/pub19-public-harness.js')]);
 const css=readFileSync('admin/src/styles.css','utf8');
 const browser=await (process.env.HAMPTON_E2E_BROWSER==='webkit'?webkit:chromium).launch({executablePath:process.env.CHROME});
 try { for(const width of [1280,390]) {
  const page=await browser.newPage({viewport:{width,height:900},reducedMotion:'reduce'}), errors=[];page.on('pageerror',e=>errors.push(e.message));
  const id='b0000000-0000-4000-8000-000000000001', auth='a0000000-0000-4000-8000-000000000001';
  let created=0, body=null, reviewed=[], available=false, scope='f0000000-0000-4000-8000-000000000001';
  await page.route('**/api/admin/demand-snapshots**',route=>{
   const u=new URL(route.request().url()),method=route.request().method();
   if(u.pathname.endsWith('/status')) return route.fulfill({json:{available}});
   if(u.pathname.endsWith('/active')) return route.fulfill({json:{draft:null}});
   if(method==='POST' && u.pathname.endsWith('/recovery-scope')) return route.fulfill({json:{scope}});
   if(method==='POST' && u.pathname.endsWith('/review-page')) {reviewed.push(route.request().postDataJSON().after);return route.fulfill({json:{id,version:1}});}
   if(method==='POST') {body=route.request().postDataJSON();created++;return route.fulfill({status:201,json:{id,version:1}});}
   const after=Number(u.searchParams.get('after')||0);
   return route.fulfill({json:{id,operation:'rent',status:'draft',version:1,as_of:'2026-11-13T00:00:00.000Z',valid_until:'2026-12-14T00:00:00.000Z',private_available:true,cells:Array.from({length:after?1:50},(_,i)=>({parish:`Fixture ${after+i}`,bedroom_band:'2',count:5})),next:after?null:50,reviewed_pages:reviewed}});
  });
  await page.route('**/pub19-synthetic',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div></body></html>'}));
  await page.goto(new URL('pub19-synthetic',process.env.BASE).href);await page.addStyleTag({content:css});await page.addScriptTag({content:admin});
  await page.getByText('Demand publication is not available yet.').waitFor(); assert.equal(await page.getByRole('button',{name:'Create or find draft'}).count(),0);
  available=true; await page.reload();await page.addStyleTag({content:css});await page.addScriptTag({content:admin});
  const old='e0000000-0000-4000-8000-000000000001';
  await page.evaluate(({scope,old})=>localStorage.setItem(`demand-draft-recovery-${scope}-rent`,old),{scope,old});
  scope='f0000000-0000-4000-8000-000000000002';
  await page.getByRole('button',{name:'Create or find draft'}).click();await page.getByText('Fixture 0 · minimum bedrooms 2 · 5').waitFor();
  assert.equal(created,1);assert.match(body.operation_id,/^[0-9a-f-]{36}$/);assert.notEqual(body.operation_id,old);
  assert.equal(await page.evaluate(()=>localStorage.getItem('demand-draft-recovery-f0000000-0000-4000-8000-000000000001-rent')),old);await page.getByLabel('Accepted authorization ID').fill(auth);
  assert.equal(await page.getByRole('button',{name:'Approve reviewed draft'}).isDisabled(),true);
  await page.getByRole('button',{name:'Mark this page reviewed'}).click();
  await page.getByRole('button',{name:'Page marked reviewed'}).waitFor();
  await page.getByRole('button',{name:'Next page'}).click();await page.getByText('Fixture 50 · minimum bedrooms 2 · 5').waitFor();
  assert.equal(await page.getByRole('button',{name:'Approve reviewed draft'}).isDisabled(),true);
  await page.getByRole('button',{name:'Mark this page reviewed'}).click();
  await page.getByRole('button',{name:'Page marked reviewed'}).waitFor();
  assert.equal(await page.getByRole('button',{name:'Approve reviewed draft'}).isDisabled(),false);
  await page.evaluate(()=>document.body.style.zoom='2');assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth+1));
  assert.deepEqual(errors,[]);await page.close();
  const pub=await browser.newPage({viewport:{width,height:900}});let held;
  await pub.route('**/api/demand/current',route=>{if(!held){held=route;return;}return route.fulfill({json:{status:'not_available'}});});
  await pub.route('**/pub19-public',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><html lang="en"><body><div id="root"></div></body></html>'}));
  await pub.goto(new URL('pub19-public',process.env.BASE).href+'#/demand');await pub.addScriptTag({content:publicCode});
  await pub.evaluate(()=>{window.renderDemand();}); await pub.waitForTimeout(50);
  await pub.evaluate(()=>{location.hash='#/elsewhere';location.hash='#/demand';window.renderDemand();});
  await pub.getByText('Demand figures are not available at present.').waitFor();
  await held.fulfill({json:{status:'available',snapshots:[{operation:'rent',definition:'old',as_of:'old',valid_until:'old',cells:[{parish:'Old data',bedroom_band:'2',display_count:5}]}]}});
  await pub.waitForTimeout(50);assert.equal(await pub.getByText('Old data',{exact:false}).count(),0);await pub.close();
 } } finally {await browser.close();}
 console.log('PUB-19 synthetic UI: pagination, recovery ID, 390/1280, zoom and stale response PASS');
})().catch(e=>{console.error(e);process.exitCode=1;});
