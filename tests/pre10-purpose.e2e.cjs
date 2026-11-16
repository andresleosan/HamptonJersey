// PRE-10 with PRE10_PURPOSE_READY=1: objection by purpose and channel. Only against the disposable networkless fixture.
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
    const fetchApi=(method,path,data)=>ctx.request.fetch(BASE+'api'+path,{method,data,headers:{origin:new URL(BASE).origin}});
    const request=async(method,path,data)=>{const r=await fetchApi(method,path,data);assert.ok(r.ok(),`${method} ${path}: ${r.status()}`);return r.json();};
    let serial=0;const seed=async()=>{
      const n=serial++,name=`PRE10 purpose ${width}-${Date.now()}-${n}`;
      const made=await request('POST','/admin/applicants',{name,email:`q${width}-${Date.now()}-${n}@example.test`,
        phone:`+447701${String(width*1000+n).padStart(6,'0')}`,source:'phone',operation:'rent',budget_max:2000,marketing:true});
      const detail=await request('GET',`/admin/applicants/${made.id}`);
      return {id:made.id,contactId:detail.contact.id,name};
    };
    const first=await seed(),other=await seed();
    const errors=[];ctx.on('page',p=>p.on('pageerror',e=>errors.push(e.message)));const page=await ctx.newPage();
    await page.goto(BASE+`admin/#/applicants/${first.id}`);
    const panel=page.locator('[aria-labelledby="marketing-heading"]');
    const grid=panel.getByLabel('Marketing by purpose and channel');
    await grid.waitFor({timeout:7000});
    const row=label=>grid.locator('div').filter({has:page.getByText(label,{exact:true})}).locator('dd');
    assert.equal(await row('News about homes and the Jersey market').textContent(),'Email: Agreed · Phone calls: Not agreed · Text messages: Not agreed');
    assert.equal(await row('Valuation offers').textContent(),'Email: Not agreed · Phone calls: Not agreed · Text messages: Not agreed');
    assert.equal(await panel.getByText('Marketing consent recorded',{exact:true}).count(),0,'the per-purpose view replaces the single line');
    const open=()=>panel.getByRole('button',{name:'Record marketing objection',exact:true});
    const submit=()=>panel.getByRole('button',{name:'Record objection',exact:true});

    // Keyboard: open puts the focus on Purpose; Cancel gives it back.
    await open().focus();await page.keyboard.press('Enter');
    await page.waitForFunction(()=>document.activeElement?.closest('label')?.textContent.startsWith('Purpose'),null,{timeout:5000});
    await panel.getByRole('button',{name:'Cancel',exact:true}).click();
    await page.waitForFunction(()=>document.activeElement?.textContent==='Record marketing objection',null,{timeout:5000});

    // An unsaved contact edit blocks it; a search draft does not.
    await page.locator('#a-name').fill('Unsaved contact');
    assert.ok(await open().isDisabled());
    await page.locator('#a-name').fill(first.name);
    await page.locator('#a-requirements').fill('Unsaved search criteria');
    assert.ok(await open().isEnabled());

    // How it was received is required.
    await open().click();
    await panel.getByRole('combobox',{name:/^Purpose/}).selectOption('news');await panel.getByRole('combobox',{name:/^Channel/}).selectOption('email');
    await submit().click();
    await panel.getByRole('alert').filter({hasText:'Choose how the objection was received.'}).waitFor();

    // Someone else changes the contact meanwhile: 409, reload, then record.
    const current=(await request('GET',`/admin/applicants/${first.id}`)).contact;
    await request('PUT',`/admin/contacts/${first.contactId}`,{updated_at:current.updated_at,best_time:'Afternoon'});
    await panel.getByRole('combobox',{name:/^How it was received/}).selectOption('phone');await submit().click();
    await panel.getByRole('alert').filter({hasText:'Contact changed'}).waitFor();
    assert.ok((await request('GET',`/admin/applicants/${first.id}`)).contact.marketing_opt_in_at);
    await panel.getByRole('button',{name:'Reload contact',exact:true}).click();
    await panel.getByRole('status').filter({hasText:'Contact reloaded'}).waitFor();
    await open().click();
    await panel.getByRole('combobox',{name:/^Purpose/}).selectOption('news');await panel.getByRole('combobox',{name:/^Channel/}).selectOption('email');
    await panel.getByRole('combobox',{name:/^How it was received/}).selectOption('phone');await submit().click();
    await panel.getByRole('status').filter({hasText:'Marketing objection recorded'}).waitFor();
    assert.equal(await page.evaluate(()=>document.activeElement.id),'marketing-heading');
    assert.equal(await page.locator('#a-requirements').inputValue(),'Unsaved search criteria');
    assert.equal(await row('News about homes and the Jersey market').textContent(),'Email: Objected · Phone calls: Not agreed · Text messages: Not agreed');
    const after=await request('GET',`/admin/applicants/${first.id}`);
    assert.equal(after.contact.marketing_opt_in_at,null);
    assert.equal(after.events.filter(e=>e.type==='contact.marketing_preference').length,1);
    assert.ok((await request('GET',`/admin/applicants/${other.id}`)).contact.marketing_opt_in_at,'another contact is untouched');
    // The panel cannot put the consent back: no website request is waiting.
    const regrant=await fetchApi('PUT',`/admin/contacts/${first.contactId}`,{updated_at:after.contact.updated_at,marketing:true});
    assert.equal(regrant.status(),409);

    // All marketing on all channels, by letter.
    await open().click();await panel.getByRole('combobox',{name:/^How it was received/}).selectOption('letter');await submit().click();
    await grid.getByText('Email: Objected · Phone calls: Objected · Text messages: Objected',{exact:true}).nth(2).waitFor();
    assert.equal(await row('Valuation offers').textContent(),'Email: Objected · Phone calls: Objected · Text messages: Objected');
    assert.equal((await request('GET',`/admin/applicants/${first.id}`)).events.filter(e=>e.type==='contact.marketing_preference').length,2);

    // A late answer after moving to another record is not shown there, and the other contact is untouched.
    const late=await seed(),p2=await ctx.newPage();await p2.goto(BASE+`admin/#/applicants/${late.id}`);
    const latePanel=p2.locator('[aria-labelledby="marketing-heading"]');
    await latePanel.getByRole('button',{name:'Record marketing objection',exact:true}).click();
    await latePanel.getByRole('combobox',{name:/^How it was received/}).selectOption('email');
    let started,release;const seen=new Promise(r=>{started=r;}),gate=new Promise(r=>{release=r;});
    await p2.route(`**/api/admin/contacts/${late.contactId}/marketing-objection`,async route=>{started();await gate;await route.continue();});
    const pending=latePanel.getByRole('button',{name:'Record objection',exact:true}).click();await seen;
    await p2.evaluate(id=>{location.hash=`#/applicants/${id}`;},other.id);
    await p2.getByRole('heading',{name:other.name,exact:true}).waitFor();
    release();await pending;await p2.waitForTimeout(250);
    assert.equal(await p2.getByText('Marketing objection recorded',{exact:false}).count(),0);
    assert.ok((await request('GET',`/admin/applicants/${other.id}`)).contact.marketing_opt_in_at);
    assert.equal((await request('GET',`/admin/applicants/${late.id}`)).contact.marketing_opt_in_at,null);
    await p2.close();

    // A server error leaves the form open with its message and records nothing.
    const failing=await seed(),p3=await ctx.newPage();await p3.goto(BASE+`admin/#/applicants/${failing.id}`);
    const p3panel=p3.locator('[aria-labelledby="marketing-heading"]');
    await p3panel.getByRole('button',{name:'Record marketing objection',exact:true}).click();
    await p3panel.getByRole('combobox',{name:/^How it was received/}).selectOption('in_person');
    await p3.route(`**/api/admin/contacts/${failing.contactId}/marketing-objection`,r=>r.fulfill({status:503,
      contentType:'application/json',body:'{"error":"Fixture unavailable"}'}));
    await p3panel.getByRole('button',{name:'Record objection',exact:true}).click();
    await p3panel.getByRole('alert').filter({hasText:'Fixture unavailable'}).waitFor();
    assert.ok(await p3panel.getByRole('button',{name:'Record objection',exact:true}).isVisible());
    assert.ok((await request('GET',`/admin/applicants/${failing.id}`)).contact.marketing_opt_in_at);
    await p3.close();

    if(width===390){await page.evaluate(()=>{document.documentElement.style.zoom='2';});
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'zoom does not overflow');}
    assert.deepEqual(errors,[]);
    await ctx.close();
  }}finally{await browser.close();}
  console.log('PRE-10 purpose UI OK: per-purpose view, keyboard, drafts, required source, 409/reload, all channels, late answer, 503, 1280/390 and zoom.');
})().catch(e=>{console.error(e.message);process.exitCode=1;});
