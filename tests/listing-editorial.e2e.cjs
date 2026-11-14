// E2E_SCRIPT=tests/listing-editorial.e2e.cjs npm run test:e2e; isolated fixtures only.
const {chromium}=require(process.env.PW||'playwright-core');
const assert=require('node:assert/strict');
const {readFileSync,mkdirSync}=require('node:fs');
const {parseEnv}=require('node:util');
const {execFileSync}=require('node:child_process');
const {join,dirname}=require('node:path');
const BASE=process.env.BASE,vars=parseEnv(readFileSync(process.env.E2E_VARS,'utf8'));
const wrangler=join(dirname(require.resolve('wrangler')),'..','bin','wrangler.js');
const sql=s=>execFileSync(process.execPath,[wrangler,'d1','execute','hampton','--local','--persist-to',process.env.E2E_PERSIST,'--json','--command',s],{encoding:'utf8'});
const SHOTS=process.env.EST17_SHOTS;
(async()=>{
  assert.ok(BASE&&process.env.E2E_PERSIST,'isolated fixture required');
  const {signSession,COOKIE}=await import('../server/auth.js');
  const browser=await chromium.launch({executablePath:process.env.CHROME});
  try{for(const width of [1280,390]){
    const at=new Date().toISOString();
    sql(`UPDATE listings SET published=0,archived_at=NULL,review_requested_at=NULL,review_requested_by=NULL,updated_at='${at}' WHERE id='HE-R003';
      UPDATE listings SET operation='rent',availability='to_let',updated_at='${at}' WHERE id='HE-R002';
      INSERT OR REPLACE INTO research_sources(source_id,property_id,title) VALUES('EST17-EVIDENCE','HE-R002','Recorded confirmation <img onerror=alert(1)>');`);
    const context=await browser.newContext({viewport:{width,height:900},reducedMotion:'reduce'});
    await context.addCookies([{name:COOKIE,value:await signSession('admin@example.test',vars.SESSION_SECRET),domain:new URL(BASE).hostname,path:'/',secure:true,httpOnly:true,sameSite:'Strict'}]);
    const page=await context.newPage(),errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    page.on('console',m=>m.type()==='error'&&!/Failed to load resource|turnstile|challenges/i.test(m.text())&&errors.push(m.text()));
    await page.route(/matterport\.com/,r=>r.abort());
    const api=async(path,body)=>page.evaluate(async({path,body})=>{const r=await fetch('/api'+path,{method:body?'POST':'GET',
      headers:body?{'content-type':'application/json'}:undefined,body:body?JSON.stringify(body):undefined});return {status:r.status,data:await r.json()};},{path,body});
    await page.goto(BASE+'admin/#/listings');
    await page.getByRole('button',{name:/^Ready for review\d*$/}).click();
    await page.getByText('No listings are ready for review.',{exact:true}).waitFor();
    await page.goto(BASE+'admin/#/p/HE-R003');
    await page.getByRole('button',{name:'Submit for review',exact:true}).waitFor();
    const before=(await api('/admin/listings/HE-R003')).data.listing.updated_at;
    await page.getByRole('button',{name:'Submit for review',exact:true}).focus();await page.keyboard.press('Enter');
    await page.getByRole('status').filter({hasText:'Ready for review. Still hidden'}).waitFor();
    assert.ok(!(await api('/listings')).data.some(p=>p.id==='HE-R003'));
    assert.equal((await api('/admin/listings/HE-R003/publish',{updated_at:before})).status,409);
    await page.getByLabel('Title',{exact:true}).fill(`Review fixture ${width}`);
    assert.equal(await page.getByRole('button',{name:'Return to draft',exact:true}).isDisabled(),true);
    await page.getByRole('button',{name:'Save',exact:true}).click();
    await page.getByRole('status').filter({hasText:'Changes saved.'}).waitFor();
    assert.ok((await api('/admin/listings/HE-R003')).data.listing.review_requested_at);
    await page.getByRole('button',{name:'Publish',exact:true}).click();
    await page.getByRole('status').filter({hasText:/Published, but|Published: now/}).waitFor();
    assert.equal((await api('/admin/listings/HE-R003')).data.listing.review_requested_at,null);
    await page.getByRole('button',{name:'Unpublish',exact:true}).click();
    await page.getByRole('dialog').getByLabel('Reason').selectOption('data_correction');
    await page.getByRole('dialog').getByRole('button',{name:'Remove from website'}).click();
    await page.getByRole('button',{name:'Submit for review',exact:true}).click();
    await page.getByRole('button',{name:'Return to draft',exact:true}).click();
    await page.getByRole('button',{name:'Submit for review',exact:true}).waitFor();
    // A temporary failure leaves the draft intact and retry available.
    await page.route('**/api/admin/listings/HE-R003/review',r=>r.fulfill({status:503,contentType:'application/json',body:'{"error":"Temporary fixture failure"}'}),{times:1});
    await page.getByRole('button',{name:'Submit for review',exact:true}).click();
    await page.getByRole('alert').filter({hasText:'Temporary fixture failure'}).waitFor();
    assert.equal(await page.getByLabel('Title',{exact:true}).inputValue(),`Review fixture ${width}`);

    sql("UPDATE listings SET operation='rent',availability='to_let' WHERE id='HE-R003'");
    await page.reload();
    await page.getByText('No recorded evidence yet.',{exact:false}).waitFor();

    await page.goto(BASE+'admin/#/p/HE-R002');
    const form=page.locator('section[aria-labelledby="h-rental-marketing"]');
    await form.getByLabel('Date of confirmation').waitFor();
    await form.getByRole('button',{name:'Record marketing state',exact:true}).click();
    assert.equal(await page.evaluate(()=>document.activeElement?.type),'date');
    const day=new Date().toISOString().slice(0,10);
    const record=async action=>{
      await form.getByLabel('Marketing action').selectOption(action);
      await form.getByLabel('Date of confirmation').fill(day);
      await form.getByLabel('Recorded evidence').selectOption('source:EST17-EVIDENCE');
      await form.getByRole('button',{name:'Record marketing state',exact:true}).click();
      await page.getByRole('status').filter({hasText:'Rental marketing state recorded.'}).waitFor();
      await page.waitForFunction(()=>document.activeElement?.id==='h-rental-marketing');
    };
    await record('let_agreed');
    assert.equal((await api('/listings')).data.find(p=>p.id==='HE-R002').status,'Let agreed');
    assert.equal(await page.getByLabel('Availability',{exact:true}).isDisabled(),true);
    assert.equal((await api('/availability?listing_id=HE-R002')).status,404);
    await record('let');
    assert.equal((await api('/listings')).data.find(p=>p.id==='HE-R002').status,'Let');
    await page.goto(BASE+'p/HE-R002');await page.locator('.summary .place').filter({hasText:/^Let in /}).waitFor();
    assert.equal(await page.locator('.summary .btns').getByRole('link',{name:'Book a viewing',exact:true}).count(),0);
    assert.equal(await page.locator('#detail-book').count(),0);
    await page.goto(BASE+'properties');await page.locator('.card[href="/p/HE-R002"] .pill.sold').filter({hasText:'Let'}).waitFor();
    await page.goto(BASE+'admin/#/p/HE-R002');await form.getByLabel('Date of confirmation').waitFor();
    // Error preserves all evidence/date choices; a later explicit reload obtains the new version.
    await form.getByLabel('Date of confirmation').fill(day);await form.getByLabel('Recorded evidence').selectOption('source:EST17-EVIDENCE');
    await page.route('**/api/admin/listings/HE-R002/rental-marketing',r=>r.fulfill({status:409,contentType:'application/json',body:'{"error":"Reload fixture version"}'}),{times:1});
    await form.getByRole('button',{name:'Record marketing state',exact:true}).click();
    await form.getByRole('alert').waitFor();assert.equal(await form.getByLabel('Date of confirmation').inputValue(),day);
    await form.getByRole('button',{name:'Reload listing',exact:true}).click();
    await record('return_to_market');
    assert.equal((await api('/admin/listings/HE-R002')).data.listing.availability,'to_let');
    assert.equal(await form.locator('img').count(),0,'evidence titles are escaped');
    await page.keyboard.press('Tab');assert.ok(await page.evaluate(()=>document.activeElement!==document.body));
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'no horizontal overflow');
    if(SHOTS){mkdirSync(SHOTS,{recursive:true});await page.screenshot({path:join(SHOTS,`est17-${width}.png`),fullPage:true});}
    await page.evaluate(()=>document.documentElement.style.zoom='2');
    await form.getByLabel('Marketing action').scrollIntoViewIfNeeded();
    if(SHOTS)await page.screenshot({path:join(SHOTS,`est17-${width}-zoom.png`),fullPage:true});
    const overflow=await page.evaluate(()=>({viewport:innerWidth,width:document.documentElement.scrollWidth,
      elements:[...document.querySelectorAll('.editor *')].filter(e=>e.getBoundingClientRect().right>innerWidth+1)
        .slice(0,8).map(e=>({tag:e.tagName,cls:e.className,right:e.getBoundingClientRect().right}))}));
    assert.ok(overflow.width<=overflow.viewport+1,'no horizontal overflow at 200%: '+JSON.stringify(overflow));
    assert.deepEqual(errors,[]);console.log(`EST-17 ${width}: review, stale version, rental states, errors, keyboard, zoom PASS`);
    await context.close();
  }}finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
