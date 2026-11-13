// PRE-10: this test runs only against the disposable networkless fixture.
const {chromium}=require(process.env.PW||'playwright-core');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const {parseEnv}=require('node:util');
const BASE=process.env.BASE, vars=parseEnv(readFileSync(process.env.E2E_VARS,'utf8'));
(async()=>{
  const {signSession,COOKIE}=await import('../server/auth.js');
  const browser=await chromium.launch(process.env.CHROME?{executablePath:process.env.CHROME}:{});
  try {for(const width of [1280,390]){
    const ctx=await browser.newContext({viewport:{width,height:900},reducedMotion:'reduce'});
    await ctx.addCookies([{name:COOKIE,value:await signSession('admin@example.test',vars.SESSION_SECRET),
      domain:new URL(BASE).hostname,path:'/',secure:true,httpOnly:true,sameSite:'Strict'}]);
    await ctx.route('https://fonts.googleapis.com/**',r=>r.fulfill({status:200,contentType:'text/css',body:'/* offline fixture */'}));
    const request=async(method,path,data)=>{
      const r=await ctx.request.fetch(BASE+'api'+path,{method,data,headers:{origin:new URL(BASE).origin}});
      assert.ok(r.ok(),`${method} ${path}: ${r.status()}`);return r.json();
    };
    let serial=0;const seed=async()=>{
      const n=serial++,name=`PRE10 fixture ${width}-${Date.now()}-${n}`;
      const email=`p${width}-${Date.now()}-${n}@example.test`,phone=`+447700${String(width*1000+n).padStart(6,'0')}`;
      const made=await request('POST','/admin/applicants',{name,email,phone,source:'phone',operation:'rent',budget_max:2000,marketing:true});
      const detail=await request('GET',`/admin/applicants/${made.id}`);
      return {id:made.id,contactId:detail.contact.id,name,email,phone};
    };
    const first=await seed(),other=await seed(),path=`/admin/contacts/${first.contactId}`;
    const second=await request('POST','/admin/applicants',{contact_id:first.contactId,source:'phone',operation:'buy',budget_max:600000});
    // The earlier pending submission is not evidence for an opt-in after a later objection.
    await request('POST','/applicants',{name:first.name,email:first.email,phone:first.phone,source:'web',operation:'rent',
      budget_max:2000,bedrooms_min:1,privacy:true,marketing:true,turnstile:'fixture'});
    const errors=[];ctx.on('page',p=>p.on('pageerror',e=>errors.push(e.message)));const page=await ctx.newPage();
    await page.goto(BASE+`admin/#/applicants/${first.id}`);
    const panel=page.locator('[aria-labelledby="marketing-heading"]');
    await panel.getByRole('heading',{name:'Marketing preference'}).waitFor({timeout:7000});
    await panel.getByText('Marketing consent recorded',{exact:true}).waitFor();
    const open=()=>panel.getByRole('button',{name:'Record marketing objection',exact:true});
    const confirm=()=>panel.getByRole('button',{name:'Confirm objection',exact:true});
    await open().focus();await page.keyboard.press('Enter');
    await page.waitForFunction(()=>document.activeElement?.textContent==='Confirm objection',null,{timeout:5000});
    await panel.getByRole('button',{name:'Cancel',exact:true}).click();
    assert.ok(await open().isVisible());
    assert.ok((await request('GET',`/admin/applicants/${first.id}`)).contact.marketing_opt_in_at);

    await page.locator('#a-name').fill('Unsaved contact');
    assert.ok(await open().isDisabled());
    await panel.getByText('Save or discard contact changes first.',{exact:true}).waitFor();
    await page.locator('#a-name').fill(first.name);
    await page.locator('#a-requirements').fill('Unsaved search criteria');
    assert.ok(await open().isEnabled(),'a search-only draft does not block the contact action');
    await open().click();
    const current=(await request('GET',`/admin/applicants/${first.id}`)).contact;
    await request('PUT',path,{updated_at:current.updated_at,best_time:'Afternoon'});
    await confirm().click();
    await panel.getByRole('alert').filter({hasText:'changed'}).waitFor();
    assert.ok((await request('GET',`/admin/applicants/${first.id}`)).contact.marketing_opt_in_at);
    await page.locator('#a-name').fill('Unsaved after conflict');
    await panel.getByRole('button',{name:'Reload contact',exact:true}).click();
    await panel.getByRole('status').filter({hasText:'Contact reloaded'}).waitFor();
    assert.equal(await page.locator('#a-requirements').inputValue(),'Unsaved search criteria');
    assert.equal(await page.locator('#a-name').inputValue(),'Unsaved after conflict');
    assert.equal(await page.locator('#a-best_time').inputValue(),'Afternoon');
    assert.ok(await open().isDisabled());await page.locator('#a-name').fill(first.name);
    await open().click();await confirm().click();
    await panel.getByRole('status').filter({hasText:'Marketing objection recorded'}).waitFor();
    assert.equal(await page.locator('#a-requirements').inputValue(),'Unsaved search criteria');
    assert.equal(await page.evaluate(()=>document.activeElement.id),'marketing-heading');
    const after=await request('GET',`/admin/applicants/${first.id}`),also=await request('GET',`/admin/applicants/${second.id}`);
    assert.equal(after.contact.marketing_opt_in_at,null);assert.equal(also.contact.marketing_opt_in_at,null);
    assert.equal(after.applicant.search_state,'active');assert.equal(also.applicant.search_state,'active');
    const consentEvents=after.events.filter(e=>e.type==='contact.consent_changed');
    assert.equal(consentEvents.length,1);assert.equal(consentEvents[0].actor,'admin@example.test');
    assert.ok((await request('GET',`/admin/applicants/${other.id}`)).contact.marketing_opt_in_at);
    assert.equal(await open().count(),0);
    await panel.getByText('Marketing consent not recorded',{exact:true}).waitFor();
    assert.equal(await page.getByRole('button',{name:'Confirm marketing opt-in',exact:true}).count(),0,'an earlier submission cannot regrant consent');
    await page.getByText('This marketing response was received before the last withdrawal.',{exact:true}).waitFor();
    await request('POST','/applicants',{name:first.name,email:first.email,phone:first.phone,source:'web',operation:'rent',
      budget_max:2000,bedrooms_min:1,privacy:true,marketing:true,turnstile:'fixture'});
    const later=await ctx.newPage();await later.goto(BASE+`admin/#/applicants/${first.id}`);
    await later.getByRole('button',{name:'Confirm marketing opt-in',exact:true}).waitFor();
    assert.equal(await later.getByRole('button',{name:'Confirm marketing opt-in',exact:true}).count(),1,'a later submission can be reviewed');
    await later.close();
    if(width===390){await page.evaluate(()=>{document.documentElement.style.zoom='2';});
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'zoom does not overflow');}

    const late=await seed(),latePath=`**/api/admin/contacts/${late.contactId}`;
    const p2=await ctx.newPage();await p2.goto(BASE+`admin/#/applicants/${late.id}`);
    const latePanel=p2.locator('[aria-labelledby="marketing-heading"]');
    await latePanel.getByRole('button',{name:'Record marketing objection',exact:true}).click();
    let started,release;const seen=new Promise(r=>{started=r;}),gate=new Promise(r=>{release=r;});
    await p2.route(latePath,async route=>{if(route.request().method()==='PUT'){started();await gate;}await route.continue();});
    const pending=latePanel.getByRole('button',{name:'Confirm objection',exact:true}).click();await seen;
    await p2.evaluate(id=>{location.hash=`#/applicants/${id}`;},other.id);
    await p2.getByRole('heading',{name:other.name,exact:true}).waitFor();
    release();await pending;await p2.waitForTimeout(250);
    assert.ok((await request('GET',`/admin/applicants/${other.id}`)).contact.marketing_opt_in_at);
    assert.equal(await p2.getByText('Marketing objection recorded',{exact:false}).count(),0);
    assert.equal((await request('GET',`/admin/applicants/${late.id}`)).contact.marketing_opt_in_at,null);

    // If the follow-up history read fails, the committed objection is not
    // retried and old opt-in submissions remain unavailable until refresh.
    const history=await seed();
    await request('POST','/applicants',{name:history.name,email:history.email,phone:history.phone,operation:'rent',
      budget_max:2000,bedrooms_min:1,privacy:true,marketing:true,turnstile:'fixture'});
    const ph=await ctx.newPage();await ph.goto(BASE+`admin/#/applicants/${history.id}`);
    const hp=ph.locator('[aria-labelledby="marketing-heading"]');
    await ph.locator('#a-requirements').fill('Retain search draft after history failure');
    await hp.getByRole('button',{name:'Record marketing objection',exact:true}).click();
    const historyRoute=route=>route.fulfill({status:503,contentType:'application/json',body:'{"error":"History unavailable"}'});
    await ph.route(`**/api/admin/applicants/${history.id}`,historyRoute);
    await hp.getByRole('button',{name:'Confirm objection',exact:true}).click();
    await hp.getByRole('status').filter({hasText:'History could not be refreshed'}).waitFor();
    assert.equal(await ph.getByRole('button',{name:'Confirm marketing opt-in',exact:true}).count(),0);
    assert.equal(await ph.locator('#a-requirements').inputValue(),'Retain search draft after history failure');
    await ph.unroute(`**/api/admin/applicants/${history.id}`,historyRoute);
    await hp.getByRole('button',{name:'Refresh marketing history',exact:true}).click();
    await ph.getByText('This marketing response was received before the last withdrawal.',{exact:true}).waitFor();
    assert.equal(await ph.locator('#a-requirements').inputValue(),'Retain search draft after history failure');

    const failing=await seed(),p3=await ctx.newPage();await p3.goto(BASE+`admin/#/applicants/${failing.id}`);
    const p3panel=p3.locator('[aria-labelledby="marketing-heading"]');
    await p3.locator('#a-requirements').fill('Keep this search draft on sign out');
    await p3panel.getByRole('button',{name:'Record marketing objection',exact:true}).click();
    const failPath=`**/api/admin/contacts/${failing.contactId}`;
    const failingRoute=route=>route.request().method()==='PUT'?route.fulfill({status:503,contentType:'application/json',body:'{"error":"Fixture unavailable"}'}):route.continue();
    await p3.route(failPath,failingRoute);
    await p3panel.getByRole('button',{name:'Confirm objection',exact:true}).click();
    await p3panel.getByRole('alert').filter({hasText:'Fixture unavailable'}).waitFor();
    assert.ok((await request('GET',`/admin/applicants/${failing.id}`)).contact.marketing_opt_in_at);
    await p3.unroute(failPath,failingRoute);
    const forbidden=route=>route.request().method()==='PUT'?route.fulfill({status:403,contentType:'application/json',body:'{"error":"Access denied"}'}):route.continue();
    await p3.route(failPath,forbidden);await p3panel.getByRole('button',{name:'Confirm objection',exact:true}).click();
    await p3panel.getByRole('alert').filter({hasText:'Access denied'}).waitFor();await p3.unroute(failPath,forbidden);
    await p3.route(failPath,route=>route.request().method()==='PUT'?route.fulfill({status:401,contentType:'application/json',body:'{"error":"Session expired"}'}):route.continue());
    await p3panel.getByRole('button',{name:'Confirm objection',exact:true}).click();
    await p3.getByRole('dialog',{name:'Session expired'}).waitFor();
    assert.equal(await p3.locator('#a-requirements').inputValue(),'Keep this search draft on sign out');
    assert.equal(await p3.getByText('Marketing objection recorded',{exact:false}).count(),0);
    assert.ok((await request('GET',`/admin/applicants/${failing.id}`)).contact.marketing_opt_in_at);

    // A request already accepted by the server may finish after session expiry;
    // its late response must not change the retained page behind the dialog.
    const ended=await seed(),p4=await ctx.newPage();await p4.goto(BASE+`admin/#/applicants/${ended.id}`);
    const p4panel=p4.locator('[aria-labelledby="marketing-heading"]');
    await p4panel.getByRole('button',{name:'Record marketing objection',exact:true}).click();
    let entered,unblock;const enteredPromise=new Promise(r=>{entered=r;}),unblockPromise=new Promise(r=>{unblock=r;});
    await p4.route(`**/api/admin/contacts/${ended.contactId}`,async route=>{
      if(route.request().method()==='PUT'){entered();await unblockPromise;}await route.continue();
    });
    const send=p4panel.getByRole('button',{name:'Confirm objection',exact:true}).click();await enteredPromise;
    await p4.evaluate(()=>dispatchEvent(new Event('hs:signed-out')));await p4.getByRole('dialog',{name:'Session expired'}).waitFor();
    const result=p4.waitForResponse(r=>r.url().endsWith(`/api/admin/contacts/${ended.contactId}`)&&r.request().method()==='PUT');
    unblock();await send;assert.equal((await result).status(),200);
    assert.match(await p4panel.textContent(),/Marketing consent recorded/);
    assert.doesNotMatch(await p4panel.textContent(),/Marketing objection recorded/);
    assert.deepEqual(errors,[]);
    await ctx.close();
  }}finally{await browser.close();}
  console.log('PRE-10 isolated UI OK: confirmation, shared searches, 409/reload, draft, 503/401, delayed navigation, 1280/390 and zoom.');
})().catch(e=>{console.error(e.message);process.exitCode=1;});
