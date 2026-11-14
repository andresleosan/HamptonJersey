// VIS-09: local fixture only, VIS09_VIEWING_POLICY_READY=1. Staff save a negotiator's viewing rules, the slots follow.
const {chromium}=require(process.env.PW || 'playwright-core');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {parseEnv}=require('node:util');
const BASE=process.env.BASE || 'http://localhost:8794/';
assert.ok(['localhost','127.0.0.1'].includes(new URL(BASE).hostname),'This test modifies local fixtures only');
(async()=>{
  const {signSession,COOKIE}=await import('../server/auth.js');
  const config=parseEnv(fs.readFileSync(process.env.E2E_VARS || '.dev.vars','utf8'));
  const browser=await chromium.launch({executablePath:process.env.CHROME});
  try{for(const [width,length,max] of [[1280,'45','6'],[390,'60','5']]){
    const ctx=await browser.newContext({viewport:{width,height:900}});
    await ctx.addCookies([{name:COOKIE,value:await signSession('admin@example.test',config.SESSION_SECRET),domain:new URL(BASE).hostname,path:'/',secure:true,httpOnly:true,sameSite:'Strict'}]);
    const api=async path=>{const r=await ctx.request.get(BASE+'api'+path);assert.ok(r.ok(),`${path}: ${r.status()}`);return r.json();};
    const before=(await api('/admin/negotiators')).negotiators[0];
    const page=await ctx.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(BASE+'admin/#/availability');
    const form=page.locator('form[aria-labelledby="h-rules"]');
    await form.waitFor({timeout:8000}).catch(async e=>{console.error({errors,body:(await page.locator('body').innerText()).slice(0,800)});throw e;});
    if(before.viewing_policy===null) await form.getByText('Not set:',{exact:false}).waitFor();
    await form.getByLabel('Viewing length (minutes)').fill(length);
    await form.getByLabel('Most viewings in a day').fill(max);
    await form.getByText('Unsaved changes').waitFor();
    await form.getByRole('button',{name:'Save viewing rules'}).click();
    await form.getByText('Viewing rules saved.',{exact:false}).waitFor();
    assert.equal(await page.evaluate(()=>document.activeElement?.id),'m-rules','the saved message takes the focus');
    const saved=(await api('/admin/negotiators')).negotiators[0].viewing_policy;
    assert.equal(saved.duration_minutes,Number(length));assert.equal(saved.max_daily,Number(max));
    assert.equal(saved.revision,(before.viewing_policy?.revision??0)+1);
    const av=await api(`/admin/availability?negotiator_id=${before.id}&days=7`);
    const times=av.days.flatMap(d=>d.slots[before.id]??[]);
    assert.ok(times.length>0,'slots are still offered');
    assert.equal(av.policies[before.id].duration_minutes,Number(length));
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),`no horizontal scroll at ${width}`);
    assert.deepEqual(errors,[]);
    console.log(`VIS-09 ${width}: viewing rules saved, revision advanced, slots follow, layout PASS`);
    await ctx.close();
  }}finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
