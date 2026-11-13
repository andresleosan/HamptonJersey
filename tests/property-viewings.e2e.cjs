// VIS-18: local fixture only; controls, persistence, public filtering and stale replies.
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
  try{for(const width of [1280,390]){
    const ctx=await browser.newContext({viewport:{width,height:900}});
    await ctx.addCookies([{name:COOKIE,value:await signSession('admin@example.test',config.SESSION_SECRET),domain:new URL(BASE).hostname,path:'/',secure:true,httpOnly:true,sameSite:'Strict'}]);
    const api=async(method,path,data)=>{const r=await ctx.request.fetch(BASE+'api'+path,{method,data,headers:{origin:new URL(BASE).origin}});assert.ok(r.ok(),`${method} ${path}: ${r.status()}`);return r.json();};
    const path='/admin/listings/HE-R001';let stored=(await api('GET',path)).listing;
    await api('PUT',path,{updated_at:stored.updated_at,viewings_enabled:1,viewing_hours:null});
    const page=await ctx.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(BASE+'admin/#/p/HE-R001');const section=page.locator('#s-viewings');await section.waitFor({timeout:8000}).catch(async e=>{console.error({errors,body:(await page.locator("body").innerText()).slice(0,1000)});throw e;});
    await section.getByRole('button',{name:'Deactivate',exact:true}).click();
    await page.getByRole('button',{name:'Save',exact:true}).click();await page.getByText('Changes saved.',{exact:true}).waitFor();
    assert.equal((await api('GET',path)).listing.viewings_enabled,0);
    await page.reload();await section.getByRole('button',{name:'Activate',exact:true}).waitFor();
    let av=await api('GET','/availability?listing_id=HE-R001');assert.equal(av.property_viewings_enabled,false);
    assert.ok(av.days.every(d=>Object.values(d.slots).every(s=>s.length===0)));
    const pub=await ctx.newPage();await pub.goto(BASE+'p/HE-R001');await pub.locator('.summary').getByRole('link',{name:'Contact us'}).waitFor();assert.equal(await pub.locator('#detail-book').count(),0);
    const internal=await ctx.newPage();await internal.goto(BASE+'admin/#/viewings?listing=HE-R001');await internal.getByRole('button',{name:'New viewing',exact:true}).click();await internal.locator('.slot-picker').getByText('Viewings are disabled for this property.',{exact:false}).waitFor();await internal.close();
    await section.getByRole('button',{name:'Activate',exact:true}).click();await section.getByRole('combobox',{name:/Viewing hours/}).selectOption('custom');
    await page.getByRole('button',{name:'Save',exact:true}).click();await section.getByRole('alert').waitFor();
    await section.getByRole('button',{name:'Add time option',exact:true}).click();
    await section.getByRole('combobox',{name:/^Day/}).selectOption('1');await section.getByLabel('From',{exact:true}).fill('10:00');await section.getByLabel('Until',{exact:true}).fill('11:00');
    await page.getByRole('button',{name:'Save',exact:true}).click();await page.getByText('Changes saved.',{exact:true}).waitFor();
    stored=(await api('GET',path)).listing;assert.deepEqual(stored.viewing_hours,[{day:1,start:'10:00',end:'11:00'}]);
    await section.getByRole('combobox',{name:/Viewing hours/}).selectOption('general');await section.getByRole('combobox',{name:/Viewing hours/}).selectOption('custom');assert.equal(await section.getByLabel('From',{exact:true}).inputValue(),'10:00');
    await page.reload();await section.getByLabel('From',{exact:true}).waitFor();assert.equal(await section.getByLabel('From',{exact:true}).inputValue(),'10:00');
    av=await api('GET','/availability?listing_id=HE-R001');const offered=av.days.flatMap(d=>Object.values(d.slots).flat().map(s=>({...s,date:d.date})));
    assert.ok(offered.length>0,'custom hours expose real agent slots');assert.ok(offered.every(s=>new Date(s.date+'T12:00:00Z').getUTCDay()===1&&s.time>='10:00'&&s.time<'11:00'));
    await pub.reload();await pub.locator('#detail-slot .times input[name=time]').first().waitFor();
    assert.ok((await pub.locator('#detail-slot .times input[name=time]').evaluateAll(es=>es.map(e=>e.value))).every(t=>t>='10:00'&&t<'11:00'));
    const booking=await ctx.newPage();await booking.goto(BASE+'admin/#/viewings?listing=HE-R001');await booking.getByRole('button',{name:'New viewing',exact:true}).click();
    const who=booking.locator('.slot-picker select');await who.locator('option[value="1"]').waitFor({state:'attached'});await who.selectOption('1');await booking.locator('.slot-picker input[name$="-day"]:not(:disabled)').first().click();await booking.locator('.slot-picker input[name$="-time"]').first().waitFor();
    assert.ok((await booking.locator('.slot-picker input[name$="-time"]').evaluateAll(es=>es.map(e=>e.value))).every(t=>t>='10:00'&&t<'11:00'));await booking.close();
    // A reply for the previous property must not override the newly chosen one.
    let release,hit;const gate=new Promise(r=>release=r),arrived=new Promise(r=>hit=r);
    await pub.route('**/api/availability?listing_id=HE-R002',async r=>{hit();await gate;await r.fulfill({json:{...av,property_viewings_enabled:false}});});
    await pub.locator('select[name=prop]').selectOption('HE-R002');await arrived;
    await pub.locator('select[name=prop]').selectOption('HE-R001');await pub.locator('#detail-slot .times input[name=time]').first().waitFor();release();await pub.waitForTimeout(200);
    assert.equal(await pub.locator('#detail-slot .form-status').textContent(),'');
    await section.getByRole('combobox',{name:/Viewing hours/}).selectOption('general');await page.getByRole('button',{name:'Save',exact:true}).click();await page.getByText('Changes saved.',{exact:true}).waitFor();assert.equal((await api('GET',path)).listing.viewing_hours,null);
    await section.getByRole('button',{name:'Deactivate',exact:true}).focus();await page.keyboard.press('Enter');assert.ok(await section.getByRole('button',{name:'Activate',exact:true}).isVisible());
    await page.getByRole('button',{name:'Discard',exact:true}).click();
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert.ok(await pub.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert.deepEqual(errors,[]);
    if(process.env.SHOTS){fs.mkdirSync(process.env.SHOTS,{recursive:true});await section.screenshot({path:`${process.env.SHOTS}/property-viewings-${width}.png`});}
    await ctx.close();console.log(`VIS-18 browser OK ${width}px`);
  }}finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
