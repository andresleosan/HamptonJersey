// Disposable local fixture; the measurement switch is deliberately absent.
const {chromium}=require(process.env.PW || 'playwright-core');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const {parseEnv}=require('node:util');
const BASE=process.env.BASE, vars=parseEnv(readFileSync(process.env.E2E_VARS,'utf8'));
(async()=>{
  assert.ok(BASE && process.env.E2E_PERSIST,'isolated fixture required');
  const {signSession,COOKIE}=await import('../server/auth.js');
  const browser=await chromium.launch({executablePath:process.env.CHROME});
  try { for(const width of [1280,390]) {
    const context=await browser.newContext({viewport:{width,height:900},timezoneId:'Europe/Jersey'});
    await context.addCookies([{name:COOKIE,value:await signSession('admin@example.test',vars.SESSION_SECRET),
      domain:new URL(BASE).hostname,path:'/',httpOnly:true,secure:true,sameSite:'Strict'}]);
    const page=await context.newPage(), errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    page.setDefaultTimeout(6000);
    await page.goto(new URL('admin/#/insights',BASE).href);
    const region=page.getByRole('region',{name:'Search measurement'});
    await region.getByText('Search measurement is not configured.',{exact:true}).waitFor();
    assert.equal(await region.getByRole('alert').count(),0);
    assert.equal(await region.getByRole('button',{name:'Retry'}).count(),0);
    assert.equal(await region.getByRole('table').count(),0);
    assert.equal(await region.getByRole('combobox').count(),0);
    const response=await page.evaluate(async()=>{
      const r=await fetch('/api/admin/insights/milestones?days=7');
      return {status:r.status,cache:r.headers.get('cache-control'),body:await r.json()};
    });
    assert.equal(response.status,200);
    assert.equal(response.cache,'no-store');
    assert.deepEqual(response.body,{enabled:false,reason:'not_configured'});
    await page.getByRole('button',{name:'7 days',exact:true}).focus();
    await page.keyboard.press('Enter');
    await region.getByText('Search measurement is not configured.',{exact:true}).waitFor();
    await page.evaluate(()=>{document.documentElement.style.zoom='2';});
    const geometry=await page.evaluate(()=>({viewport:innerWidth,document:document.documentElement.scrollWidth}));
    assert.ok(geometry.document<=geometry.viewport+1,'page reflows at 200%');
    assert.deepEqual(errors,[]); await context.close();
    console.log(`Search measurement disabled ${width}px: normal state, keyboard and reflow passed.`);
  }} finally { await browser.close(); }
})().catch(e=>{console.error(e);process.exitCode=1;});
