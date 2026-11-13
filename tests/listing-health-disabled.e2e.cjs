// Local offline fixture: the feature gate is deliberately absent.
const {chromium}=require(process.env.PW||'playwright-core');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const {parseEnv}=require('node:util');
(async()=>{
  const vars=parseEnv(readFileSync(process.env.E2E_VARS,'utf8'));
  const {signSession,COOKIE}=await import('../server/auth.js');
  const browser=await chromium.launch({executablePath:process.env.CHROME});
  try{
    const ctx=await browser.newContext({viewport:{width:390,height:900}});
    await ctx.addCookies([{name:COOKIE,value:await signSession('admin@example.test',vars.SESSION_SECRET),domain:new URL(process.env.BASE).hostname,path:'/',httpOnly:true,secure:true,sameSite:'Strict'}]);
    const page=await ctx.newPage();await page.goto(new URL('admin/#/insights',process.env.BASE).href);
    const block=page.getByRole('region',{name:'Listings to review'});
    await block.getByText(/Listing health is not available yet/).waitFor();
    assert.equal(await block.getByRole('alert').count(),0);
    assert.equal(await block.getByRole('button',{name:'Retry'}).count(),0);
    await ctx.close();console.log('Disabled listing health is a normal state.');
  } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
