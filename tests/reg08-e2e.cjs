// Synthetic local fixture only. REG08_MCP keeps this fixture alive for the final interactive verification.
const assert=require('node:assert/strict');
const {readFileSync,writeFileSync,mkdirSync,existsSync}=require('node:fs');
const {parseEnv}=require('node:util');
const {chromium}=require(process.env.PW || 'playwright-core');
const BASE=process.env.BASE, shots='/tmp/reg08-captures';
(async()=>{
  mkdirSync(shots,{recursive:true});
  const vars=parseEnv(readFileSync(process.env.E2E_VARS,'utf8'));
  const {signSession,COOKIE}=await import('../server/auth.js');
  const cookies=[{name:COOKIE,value:await signSession('admin@example.test',vars.SESSION_SECRET),domain:new URL(BASE).hostname,path:'/',secure:true,httpOnly:true,sameSite:'Strict'}];
  const browser=await chromium.launch({executablePath:process.env.CHROME});
  try {
    const ctx=await browser.newContext(), page=await ctx.newPage();
    await ctx.addCookies(cookies);await page.goto(BASE+'admin/');await page.locator('#t-inbox').waitFor();
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    let applicantId;
    for(const width of [1280,390]){
      await page.setViewportSize({width,height:900});
      await page.goto(BASE+'#/apply');
      await page.evaluate(()=>sessionStorage.removeItem('hampton-apply'));await page.reload();
      await page.locator('.apply form').waitFor();
      const form=page.locator('.apply form'), next=form.locator('button[type=submit]');
      const choice=async(name,value)=>form.locator(`input[name="${name}"][value="${value}"] + span`).click();
      await choice('search_category','residential');await choice('operation','rent');await next.click();
      await choice('parishes_wanted','St Helier');await form.getByRole('switch',{name:'Location must-have',exact:true}).click();
      await next.click();await choice('bedrooms_min','2');
      const beds=form.getByRole('switch',{name:'Bedrooms must-have',exact:true});await beds.focus();await page.keyboard.press('Space');assert.equal(await beds.getAttribute('aria-checked'),'true');
      await next.click();await next.click();assert.match(await form.locator('#e-parking_spaces').textContent(),/Choose/);
      await choice('parking_spaces','2');await choice('pets','dog');
      const park=form.getByRole('switch',{name:'Parking must-have',exact:true});await park.click();
      await form.getByRole('switch',{name:'Pets must-have',exact:true}).click();
      await park.click();assert.equal(await form.locator('[name=parking_spaces]:checked').inputValue(),'2');await park.click();
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
      const box=await park.boundingBox(), header=await park.locator('..').boundingBox();assert.ok(Math.abs(box.x+box.width-header.x-header.width)<3,'switch aligned right');
      await page.screenshot({path:`${shots}/public-parking-${width}.png`,fullPage:true});
      await form.getByRole('button',{name:'Back',exact:true}).click();assert.equal(await beds.getAttribute('aria-checked'),'true');await next.click();assert.equal(await park.getAttribute('aria-checked'),'true');
      await next.click();await form.locator('[name=budget_max]').fill('2000');await form.locator('[name=budget_stretch]').fill('2200');
      await form.getByRole('switch',{name:'Budget must-have',exact:true}).click();assert.match(await form.locator('#budget-limit').textContent(),/including your stretch: £2,200 per month/);await next.click();
      await choice('household_children_status','known');await form.locator('[name=household_children]').fill('2');
      await form.locator('[data-child-age]').nth(0).selectOption('0');await form.locator('[data-child-age]').nth(1).selectOption('7');
      const children=form.getByRole('switch',{name:'Children must-have',exact:true});await children.click();await children.click();
      assert.deepEqual(await form.locator('[data-child-age]').evaluateAll(es=>es.map(e=>e.value)),['0','7']);await children.click();
      const stored=await page.evaluate(()=>JSON.parse(sessionStorage.getItem('hampton-apply')));
      assert.equal(stored.a.household_children_ages,undefined);assert.equal(stored.a.household_children,undefined);assert.equal(stored.a.requirement_priorities.values.children,undefined);
      await page.screenshot({path:`${shots}/public-children-${width}.png`,fullPage:true});
      await next.click();await form.locator('[name=name]').fill(`REG08 Browser ${width}`);await form.locator('[name=email]').fill(`reg08-${width}@example.test`);await form.locator('[name=phone]').fill(width===1280?'07797000390':'07797000391');await form.locator('[name=privacy]').check();
      await page.waitForFunction(()=>document.querySelector('.apply [name="cf-turnstile-response"]')?.value,null,{timeout:45000});
      if(width===390){
        await page.route('**/api/applicants',route=>route.abort());await next.click();await form.getByRole('alert').filter({hasText:'Your answers are still here'}).waitFor();assert.equal(await form.locator('[name=name]').inputValue(),`REG08 Browser ${width}`);await page.unroute('**/api/applicants');
        await page.waitForFunction(()=>document.querySelector('.apply [name="cf-turnstile-response"]')?.value,null,{timeout:45000});
      }
      const response=page.waitForResponse(r=>r.url().endsWith('/api/applicants')&&r.request().method()==='POST');await next.click();const res=await response;assert.equal(res.status(),201,await res.text());await page.locator('.apply .confirm').waitFor();
    }
    const data=await page.evaluate(async()=>{const r=await fetch('/api/admin/applicants?q=reg08-1280');if(!r.ok)throw new Error(`Lookup failed: ${r.status}`);return r.json();});applicantId=data.applicants[0].id;
    for(const width of [1280,390]){
      await page.setViewportSize({width,height:900});await page.goto(BASE+`admin/#/applicants/${applicantId}`);
      const field=page.locator('#a-parking_spaces');await field.waitFor();assert.equal(await field.inputValue(),'2');
      const toggle=page.getByRole('switch',{name:'Parking must-have',exact:true});assert.equal(await toggle.getAttribute('aria-checked'),'true');
      await toggle.click();const saved=page.waitForResponse(r=>r.url().endsWith(`/admin/applicants/${applicantId}`)&&r.request().method()==='PUT');await page.getByRole('button',{name:'Save',exact:true}).click();assert.equal((await saved).status(),200);await page.getByText('Changes saved.',{exact:true}).waitFor();await page.reload();await field.waitFor();assert.equal(await field.inputValue(),'2');assert.equal(await toggle.getAttribute('aria-checked'),'false');
      await toggle.click();await page.getByRole('button',{name:'Save',exact:true}).click();await page.getByText('Changes saved.',{exact:true}).waitFor();
      assert.equal(await page.locator('#a-child-age-0').inputValue(),'0');assert.equal(await page.locator('#a-child-age-1').inputValue(),'7');
      await page.locator('#g-home').scrollIntoViewIfNeeded();await page.screenshot({path:`${shots}/panel-${width}.png`,fullPage:true});
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
      await page.evaluate(()=>document.documentElement.style.zoom='2');
      const overflow=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,elements:[...document.querySelectorAll('body *')].filter(e=>e.getBoundingClientRect().right>innerWidth+1).slice(-16).map(e=>({tag:e.tagName,cls:e.className,id:e.id,width:Math.round(e.getBoundingClientRect().width)}))}));
      assert.ok(overflow.scroll<=overflow.width,JSON.stringify(overflow));await page.evaluate(()=>document.documentElement.style.zoom='');
    }
    assert.deepEqual(errors,[]);
    console.log('REG08 public/panel 1280 and 390: switches, ages, validation, Back, keyboard, storage, submission, error retry, reload, zoom passed.');
    if(process.env.REG08_MCP){
      writeFileSync('/tmp/reg08-browser.json',JSON.stringify({url:BASE,cookies,applicantId}),{mode:0o600});
      console.log('Local REG08 fixture ready for MCP; state is private in /tmp/reg08-browser.json.');
      while(!existsSync('/tmp/reg08-browser-done'))await new Promise(r=>setTimeout(r,1000));
    }
    await ctx.close();
  } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
