// REG-12: synthetic local fixture only, using the isolated browser launcher.
const assert=require('node:assert/strict');
const {readFileSync,writeFileSync,mkdirSync,existsSync}=require('node:fs');
const {parseEnv}=require('node:util');
const {chromium}=require(process.env.PW || 'playwright-core');
const BASE=process.env.BASE, shots=process.env.E2E_SHOTS || '/tmp/reg08-captures';
(async()=>{
  mkdirSync(shots,{recursive:true});
  const vars=parseEnv(readFileSync(process.env.E2E_VARS,'utf8'));
  const {signSession,COOKIE}=await import('../server/auth.js');
  const cookies=[{name:COOKIE,value:await signSession('admin@example.test',vars.SESSION_SECRET),domain:new URL(BASE).hostname,path:'/',secure:true,httpOnly:true,sameSite:'Strict'}];
  const browser=await chromium.launch({executablePath:process.env.CHROME});
  try {
    const ctx=await browser.newContext(), page=await ctx.newPage();
    await ctx.addCookies(cookies);await page.goto(BASE+'admin/');await page.locator('#t-inbox').waitFor();

    const errors=[]; page.on('pageerror', e=>errors.push(e.message));
    const receipts=[], responses=[], reflowFailures=[];
    for (const [width,commercial] of [[1280,false],[390,false],[390,true]]) {
      await page.setViewportSize({width,height:900});
      await page.goto(BASE+'#/apply');
      await page.evaluate(()=>sessionStorage.removeItem('hampton-apply')); await page.reload();
      const form=page.locator('.apply form'); await form.waitFor();
      const next=form.locator('button[type=submit]');
      const choice=async (name,value)=>form.locator(`input[name="${name}"][value="${value}"] + span`).click();
      await choice('search_category',commercial?'commercial':'residential');
      if (commercial) await choice('commercial_kind','property');
      await choice('operation',commercial?'rent':'both'); await next.click();
      await choice('area_answer','any'); await next.click();
      if (!commercial) await choice('bedrooms_min','2');
      await next.click();
      if (!commercial) {
        await choice('parking_spaces','unknown'); await choice('pets','unknown');
        await form.getByRole('switch',{name:'Parking must-have',exact:true}).click();
      }
      await next.click();
      if (!commercial) {
        await form.locator('[name=budget_max_rent]').fill('2000'); await form.locator('[name=budget_max_buy]').fill('500000');
      }
      await next.click(); await next.click();
      await form.locator('[name=name]').fill('Synthetic REG12 Applicant');
      await form.locator('[name=email]').fill(commercial?'reg12-commercial@example.test':'reg12-browser@example.test');
      await form.locator('[name=phone]').fill(commercial?'07797000998':'07797000997'); await form.locator('[name=privacy]').check();
      await page.waitForFunction(()=>document.querySelector('.apply [name="cf-turnstile-response"]')?.value,null,{timeout:45000});
      const wait=page.waitForResponse(r=>r.url().endsWith('/api/applicants')&&r.request().method()==='POST');
      await next.click(); const response=await wait;
      assert.equal(response.status(),201); responses.push(await response.json());
      const receipt=page.locator('.apply .confirm'); await receipt.waitFor();
      assert.equal(await receipt.getAttribute('role'),'status');
      assert.equal(await receipt.evaluate(el=>document.activeElement===el),true);
      assert.equal(await receipt.getByRole('heading',{level:2}).textContent(),'Thank you. We have received your search request.');
      const text=await receipt.innerText();
      assert.match(text,/Our team will review the information you provided/);
      assert.match(text,/we'll be in touch within one working day/i);
      assert.doesNotMatch(text,/Synthetic REG12|match found|viewing confirmed/i);
      receipts.push(text);
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);
      await receipt.getByRole('link',{name:'See our properties'}).focus();
      assert.equal(await receipt.getByRole('link',{name:'See our properties'}).evaluate(el=>document.activeElement===el),true);
      if (width===390) {
        await page.evaluate(()=>document.documentElement.style.zoom='2');
        const reflow=await page.evaluate(()=>{
          const receipt=document.querySelector('.apply .confirm'), currentMarkup=receipt.innerHTML;
          const measure=()=>({width:innerWidth, scroll:document.documentElement.scrollWidth,
            overflow:[...document.querySelectorAll('body *')].map(el=>({tag:el.tagName,id:el.id,
              cls:typeof el.className==='string'?el.className:'',right:Math.round(el.getBoundingClientRect().right)}))
              .filter(el=>el.right>innerWidth+1).sort((a,b)=>b.right-a.right).slice(0,10)});
          const current=measure();
          receipt.innerHTML='<h2>Thank you, Synthetic REG12 Applicant. We\'ll be in touch within one working day.</h2><div class="actions"><a class="btn ghost" href="#portfolio">See our properties</a></div>';
          const previous=measure(); receipt.innerHTML=currentMarkup;
          return {current,previous};
        });
        console.log('REG-12-REFLOW public '+JSON.stringify(reflow));
        if (reflow.current.scroll>reflow.current.width+1) reflowFailures.push({screen:'public',...reflow});
        await page.evaluate(()=>document.documentElement.style.zoom='1');
      }
    }
    assert.deepEqual(responses,[{ok:true},{ok:true},{ok:true}]);
    assert.ok(receipts.every(text=>text===receipts[0]));
    const data=await page.evaluate(async()=>{
      const response=await fetch('/api/admin/applicants?q=reg12-browser');
      if (!response.ok) throw new Error(`Fixture lookup failed: ${response.status}`);
      return response.json();
    });
    assert.equal(data.applicants.length,2);
    const id=data.applicants.find(a=>a.operation==='rent').id;
    for (const width of [1280,390]) {
      await page.setViewportSize({width,height:900});
      await page.goto(BASE+`admin/#/applicants/${id}`);
      const panel=page.locator('section[aria-labelledby="essential-heading"]');
      await panel.getByRole('heading',{name:'Details to confirm',exact:true}).waitFor();
      assert.match(await panel.innerText(),/Based on the saved residential search/);
      assert.match(await panel.innerText(),/does not show matching progress/);
      const review=panel.getByRole('button',{name:'Confirm Parking',exact:true});
      await review.focus(); await page.keyboard.press('Enter');
      assert.equal(await page.locator('#a-parking_spaces').evaluate(el=>el===document.activeElement),true);
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);
      if (width===390) {
        await page.evaluate(()=>document.documentElement.style.zoom='2');
        const reflow=await page.evaluate(()=>{
          const panel=document.querySelector('section[aria-labelledby="essential-heading"]');
          const measure=()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,
            overflow:[...document.querySelectorAll('body *')].map(el=>({tag:el.tagName,id:el.id,
              cls:typeof el.className==='string'?el.className:'',right:Math.round(el.getBoundingClientRect().right)}))
              .filter(el=>el.right>innerWidth+1).sort((a,b)=>b.right-a.right).slice(0,10)});
          const current=measure(); panel.style.display='none'; const previous=measure(); panel.style.display='';
          return {current,previous};
        });
        console.log('REG-12-REFLOW admin '+JSON.stringify(reflow));
        if (reflow.current.scroll>reflow.current.width+1) reflowFailures.push({screen:'admin',...reflow});
        await page.evaluate(()=>document.documentElement.style.zoom='1');
        await page.locator('#a-parking_spaces').selectOption('2');
        assert.equal(await review.isVisible(),true,'unsaved data must not replace the saved-search list');
        const saved=page.waitForResponse(r=>r.url().endsWith(`/admin/applicants/${id}`)&&r.request().method()==='PUT');
        await page.getByRole('button',{name:'Save',exact:true}).click(); assert.equal((await saved).status(),200);
        await page.getByText('Changes saved.',{exact:true}).waitFor();
        assert.equal(await panel.getByRole('button',{name:'Confirm Parking',exact:true}).count(),0);
      }
    }
    const commercial=await page.evaluate(async()=>{
      const response=await fetch('/api/admin/applicants?q=reg12-commercial');
      if (!response.ok) throw new Error(`Fixture lookup failed: ${response.status}`);
      return response.json();
    });
    assert.equal(commercial.applicants.length,1);
    await page.goto(BASE+`admin/#/applicants/${commercial.applicants[0].id}`);
    await page.locator('#a-commercial_use').waitFor();
    assert.equal(await page.locator('section[aria-labelledby="essential-heading"]').count(),0);
    await page.getByRole('tab',{name:'Matches',exact:true}).click();
    await page.getByText('Commercial matching is not available yet. Please review this search manually.').waitFor();
    const legacy=await page.evaluate(async()=>{
      const response=await fetch('/api/admin/applicants',{method:'POST',headers:{'content-type':'application/json'},
        body:JSON.stringify({name:'Synthetic priority review',email:'reg12-priority@example.test',source:'phone',
          operation:'rent',near:'Work',budget_max:2000,
          requirement_priorities:{version:1,values:{near:'unknown',bedrooms:'unknown'},unknown:['pets']}})});
      return {status:response.status,data:await response.json()};
    });
    assert.equal(legacy.status,201);
    await page.goto(BASE+`admin/#/applicants/${legacy.data.id}`);
    const priorities=page.locator('section[aria-labelledby="essential-heading"]');
    await priorities.getByRole('button',{name:'Review Near somewhere must-have priority'}).waitFor();
    await priorities.getByRole('button',{name:'Review Bedrooms must-have priority'}).waitFor();
    await priorities.getByRole('button',{name:'Review Pets must-have priority'}).waitFor();
    assert.doesNotMatch(await priorities.innerText(),/optional|preferred/i);
    await page.locator('#a-budget_max').fill('2100');
    const savedUnknown=page.waitForResponse(r=>r.url().endsWith(`/admin/applicants/${legacy.data.id}`)&&r.request().method()==='PUT');
    await page.getByRole('button',{name:'Save',exact:true}).click();
    const result=await savedUnknown; assert.equal(result.status(),200);
    assert.deepEqual((await result.json()).applicant.requirement_priorities,
      {version:1,values:{near:'unknown',bedrooms:'unknown'},unknown:['pets']});
    await priorities.getByRole('button',{name:'Review Near somewhere must-have priority'}).waitFor();
    assert.deepEqual(errors,[]);
    assert.deepEqual(reflowFailures,[],'200% reflow must fit in both screens');
    console.log('REG-12: identical public receipt, unsupported commercial and saved criteria review at 1280/390 with keyboard passed.');
    await ctx.close();
  } finally { await browser.close(); }
})().catch(e=>{console.error(e);process.exitCode=1;});
