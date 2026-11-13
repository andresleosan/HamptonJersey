// Only synthetic fixture data in the disposable, networkless browser container.
const {chromium}=require(process.env.PW || 'playwright-core');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const {parseEnv}=require('node:util');
const BASE=process.env.BASE, vars=parseEnv(readFileSync(process.env.E2E_VARS,'utf8'));
(async()=>{
  assert.ok(BASE && process.env.E2E_PERSIST,'isolated fixture required');
  const {signSession,COOKIE}=await import('../server/auth.js');
  const browser=await chromium.launch({executablePath:process.env.CHROME});
  try { for (const width of [1280,390]) {
    const ctx=await browser.newContext({viewport:{width,height:900},timezoneId:'Europe/Jersey'});
    await ctx.addCookies([{name:COOKIE,value:await signSession('admin@example.test',vars.SESSION_SECRET),
      domain:new URL(BASE).hostname,path:'/',httpOnly:true,secure:true,sameSite:'Strict'}]);
    const page=await ctx.newPage(), errors=[];page.on('pageerror',e=>errors.push(e.message));
    page.setDefaultTimeout(12000);
    await page.goto(new URL('admin/#/insights',BASE).href);
    const block=page.getByRole('region',{name:'Search trends'});
    await block.getByText('Search trends are not available.').waitFor();
    await block.getByText('Search actions, not people; counts may be incomplete.').waitFor();
    let mode='data';
    await page.route('**/api/admin/insights/search-trends**',route=>{
      if(mode==='error')return route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'Synthetic unavailable'})});
      const data={available:true,coverage:'unknown',source:'Website search counters',period:{days:7,from:'2026-07-01',to:'2026-07-03'},versions:[1],capped:true,
        series:[{day:'2026-07-01',actions:null,zero_results:null,capped:false},{day:'2026-07-02',actions:7,zero_results:2,capped:true}],
        totals:mode==='empty'?[]:[{version:1,dimension:'op',label:'Rent',n:7}]};
      return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)});
    });
    const seven=page.getByRole('button',{name:'7 days',exact:true});await seven.focus();await page.keyboard.press('Enter');
    await block.getByText('Daily limit reached; some actions were not counted.').waitFor();
    await block.getByRole('table',{name:'Search filters'}).getByText('Rent',{exact:true}).waitFor();
    await block.getByText('No data',{exact:true}).first().waitFor();
    await page.evaluate(()=>{document.documentElement.style.zoom='2';});
    const overflow=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth}));
    assert.ok(overflow.scroll<=overflow.width+1,'no page overflow at 200%');
    await page.evaluate(()=>{document.documentElement.style.zoom='1';});
    mode='error';await page.getByRole('button',{name:'30 days',exact:true}).click();
    await block.getByRole('alert').waitFor();
    mode='empty';const retry=block.getByRole('button',{name:'Retry search trends'});await retry.focus();await page.keyboard.press('Enter');
    await block.getByText('No filter data recorded for this period.').waitFor();
    assert.deepEqual(errors,[]);await ctx.close();
    console.log(`Search trends ${width}px: unavailable, synthetic data, capped, error, keyboard and zoom.`);
  }} finally {await browser.close();}
})().catch(e=>{console.error(e.message);process.exitCode=1;});
