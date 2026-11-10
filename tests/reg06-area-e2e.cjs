// REG-06/07: browser journeys against run-e2e's disposable local fixture.
const assert = require('node:assert/strict');
const {mkdirSync,readFileSync} = require('node:fs');
const {parseEnv} = require('node:util');
const {execFileSync} = require('node:child_process');
const {chromium} = require(process.env.PW || 'playwright-core');
const BASE = process.env.BASE, SHOTS = process.env.E2E_SHOTS || '/tmp/paq02-shots';

(async()=>{
  mkdirSync(SHOTS,{recursive:true});
  const vars=parseEnv(readFileSync(process.env.E2E_VARS,'utf8'));
  const {signSession,COOKIE}=await import('../server/auth.js');
  const browser=await chromium.launch({executablePath:process.env.CHROME});
  let ctx=null,page=null;const errors=[],consoleErrors=[],localFailures=[];
  const newPage=async width=>{
    ctx=await browser.newContext();
    await ctx.addCookies([{name:COOKIE,value:await signSession('admin@example.test',vars.SESSION_SECRET),
      domain:new URL(BASE).hostname,path:'/',secure:true,httpOnly:true,sameSite:'Strict'}]);
    page=await ctx.newPage();page.on('pageerror',error=>errors.push(error.message));
    page.on('console',message=>{
      const text=message.text();
      if(message.type()==='error' && !/Failed to load resource|turnstile|challenges/i.test(text)
        && !/^Failed to preconnect to https:\/\/fonts\.(?:gstatic|googleapis)\.com\//.test(text)) consoleErrors.push(text);
    });
    page.on('requestfailed',request=>{
      const url=new URL(request.url()), reason=request.failure()?.errorText ?? '';
      if(url.origin===new URL(BASE).origin && !/cancelled|aborted/i.test(reason))localFailures.push({path:url.pathname,reason});
    });
    page.on('response',response=>{const url=new URL(response.url());if(url.origin===new URL(BASE).origin && response.status()>=500)localFailures.push(url.pathname);});
    await page.setViewportSize({width,height:900});
  };
  const withDialog=async(action,accept)=>{
    const pending=page.waitForEvent('dialog');
    const operation=action();
    const dialog=await pending;
    await (accept ? dialog.accept() : dialog.dismiss());
    await operation;
  };
  const noOverflow=async()=>{
    const measure=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,
      offenders:[...document.querySelectorAll('body *')].filter(e=>e.getBoundingClientRect().right>innerWidth+2)
        .slice(0,6).map(e=>({tag:e.tagName,className:String(e.className).slice(0,80),right:Math.round(e.getBoundingClientRect().right)}))}));
    assert.ok(measure.scroll<=measure.width,JSON.stringify(measure));
  };
  const nativeZoom=async(label,width,selector,verify=async()=>{})=>{
    const before=await page.evaluate(()=>innerWidth);
    execFileSync('python3',['tests/e2e-x11-zoom.py','in']);
    await page.waitForFunction(w=>innerWidth<=w/2,before);
    await page.locator(selector).first().scrollIntoViewIfNeeded();
    await page.waitForTimeout(300);
    execFileSync('python3',['tests/e2e-x11-screenshot.py',`${SHOTS}/${label}-${width}-zoom.png`,String(width),'900']);
    await noOverflow();
    await verify();
    execFileSync('python3',['tests/e2e-x11-zoom.py','reset']);
    await page.waitForFunction(w=>innerWidth===w,before);
  };
  const focusUnobscured=async control=>{
    const result=await control.evaluate(el=>{
      const r=el.getBoundingClientRect(), x=r.left+r.width/2, y=r.top+r.height/2;
      const hit=document.elementFromPoint(x,y);
      return {focused:document.activeElement===el, inViewport:x>=0&&x<innerWidth&&y>=0&&y<innerHeight,
        unobscured:hit===el||el.contains(hit)};
    });
    assert.deepEqual(result,{focused:true,inViewport:true,unobscured:true},'focused control is visible above fixed bars at native zoom');
  };
  try{
    for(const width of [1280,390]){
      await newPage(width);
      await page.goto(BASE+'#/apply');await page.evaluate(()=>sessionStorage.removeItem('hampton-apply'));await page.reload();
      let form=page.locator('.apply form');await form.waitFor();
      let next=form.locator('button[type=submit]');
      const choice=(name,value)=>form.locator(`input[name="${name}"][value="${value}"] + span`).click();
      // WebKitGTK can leave an accepted native confirmation painted above the page. Renew the
      // context after each dialog and restore only the synthetic registration draft.
      const renewRegistration=async()=>{
        const draft=await page.evaluate(()=>Object.fromEntries(Object.entries(sessionStorage)));
        await ctx.close();ctx=null;await newPage(width);
        await page.goto(BASE);
        await page.waitForFunction(()=>{const e=document.querySelector('#book-slot .agents');return e && !e.textContent.includes('Loading available times');});
        await page.evaluate(entries=>{for(const [key,value] of Object.entries(entries))sessionStorage.setItem(key,value);},draft);
        await page.goto(BASE+'#/apply');
        form=page.locator('.apply form');await form.waitFor();next=form.locator('button[type=submit]');
      };
      await choice('search_category','residential');await choice('operation','rent');await next.click();
      await next.click();assert.equal(await form.locator('[name=area_answer][aria-invalid=true]').count(),3);
      const selected=form.locator('[name=area_answer][value=selected]');await selected.focus();await page.keyboard.press('Space');
      assert.equal(await selected.isChecked(),true);await page.keyboard.press('Tab');
      assert.equal(await page.evaluate(()=>document.activeElement?.closest('.apply form')!=null),true);
      await choice('parishes_wanted','St Saviour');await choice('parishes_wanted','St Helier');
      await form.locator('[name=preferred_parish]').selectOption('St Saviour');
      await form.locator('details.more summary').click();await choice('parishes_excluded','St Ouen');
      assert.equal(await form.locator('[name=parishes_excluded]:checked').inputValue(),'St Ouen');
      await noOverflow();await page.screenshot({path:`${SHOTS}/registration-area-${width}.png`,fullPage:true});
      await nativeZoom('registration-area',width,'.apply [name=area_answer]:checked + span');
      assert.equal(await form.locator('[name=parishes_excluded]:checked').inputValue(),'St Ouen');
      await withDialog(()=>choice('area_answer','any'),false);
      assert.equal(await form.locator('[name=area_answer]:checked').inputValue(),'selected');
      assert.equal(await form.locator('[name=parishes_wanted]:checked').count(),2);
      assert.equal(await form.locator('[name=preferred_parish]').inputValue(),'St Saviour');
      assert.equal(await form.locator('[name=parishes_excluded]:checked').inputValue(),'St Ouen');
      await renewRegistration();
      await withDialog(()=>choice('area_answer','any'),true);
      assert.equal(await form.locator('[name=area_answer]:checked').inputValue(),'any');
      assert.equal(await form.locator('[name=parishes_wanted]:checked').count(),0);
      assert.equal(await form.locator('[name=parishes_excluded]:checked').inputValue(),'St Ouen');
      await renewRegistration();
      await choice('area_answer','selected');
      await choice('parishes_wanted','St Saviour');await choice('parishes_wanted','St Helier');
      await form.locator('[name=preferred_parish]').selectOption('St Saviour');
      await withDialog(()=>choice('area_answer','unknown'),true);
      assert.equal(await form.locator('[name=parishes_wanted]:checked').count(),0);
      assert.equal(await form.locator('[name=parishes_excluded]:checked').inputValue(),'St Ouen');
      await renewRegistration();
      assert.equal(await form.locator('[name=area_answer]:checked').inputValue(),'unknown');
      assert.equal(await form.locator('[name=parishes_excluded]:checked').inputValue(),'St Ouen');
      await next.click();await form.getByRole('button',{name:'Back',exact:true}).click();
      assert.equal(await form.locator('[name=area_answer]:checked').inputValue(),'unknown');
      await choice('area_answer','selected');await choice('parishes_wanted','St Saviour');await choice('parishes_wanted','St Helier');
      await form.locator('[name=preferred_parish]').selectOption('St Saviour');await next.click();
      await choice('bedrooms_min','2');await next.click();
      await choice('parking_spaces','unknown');await choice('pets','unknown');await next.click();
      await form.locator('[name=budget_max]').fill('2000');await next.click();await next.click();
      await form.locator('[name=name]').fill(`Area fixture ${width}`);
      await form.locator('[name=email]').fill(`area-browser-${width}@example.test`);
      await form.locator('[name=phone]').fill(width===1280?'07797000390':'07797000391');
      const privacy=form.locator('[name=privacy]');
      await privacy.evaluate(el=>{
        el.testPointerEvents=[];
        for(const type of ['pointerdown','pointerup','click','change']) el.addEventListener(type,()=>{
          const r=el.getBoundingClientRect();el.testPointerEvents.push({type,checked:el.checked,x:r.x,y:r.y});
        });
      });
      // Focus may start smooth scrolling; wait for its position to settle before the pointer click.
      await privacy.focus();
      await privacy.evaluate(async el=>{
        let previous=NaN, stable=0;
        for(let i=0;i<120 && stable<4;i++){
          await new Promise(requestAnimationFrame);
          const y=el.getBoundingClientRect().y;
          stable=Math.abs(y-previous)<0.5 ? stable+1 : 0;previous=y;
        }
        if(stable<4)throw new Error('Privacy control did not settle after scrolling');
      });
      try { await privacy.check(); }
      catch(error) {
        const hit=await form.locator('[name=privacy]').evaluate(el=>{
          const r=el.getBoundingClientRect(), e=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);
          return {checked:el.checked,rect:{x:r.x,y:r.y,width:r.width,height:r.height},hit:e?.tagName,hitName:e?.getAttribute('name'),events:el.testPointerEvents};
        });
        console.log('Privacy checkbox diagnostic:', JSON.stringify(hit));
        await page.screenshot({path:`${SHOTS}/privacy-failure-${width}.png`,fullPage:true});
        execFileSync('python3',['tests/e2e-x11-screenshot.py',`${SHOTS}/privacy-screen-${width}.png`,String(width),'900']);
        throw error;
      }
      await page.waitForFunction(()=>document.querySelector('.apply [name="cf-turnstile-response"]')?.value,null,{timeout:30000});
      const response=page.waitForResponse(r=>r.url().endsWith('/api/applicants')&&r.request().method()==='POST');
      await next.click();assert.equal((await response).status(),201);await page.locator('.apply .confirm').waitFor();
      const lookup=await page.evaluate(async width=>{
        const r=await fetch(`/api/admin/applicants?q=area-browser-${width}`);return {status:r.status,data:await r.json()};
      },width);
      assert.equal(lookup.status,200);assert.equal(lookup.data.applicants.length,1);
      const id=lookup.data.applicants[0].id;
      // A new private window avoids retaining an automated dialog when taking the next native screenshot.
      await ctx.close();ctx=null;await newPage(width);
      await page.goto(BASE+`admin/#/applicants/${id}`);
      await page.locator('#a-preferred_parish').waitFor();
      assert.equal(await page.locator('#a-preferred_parish').inputValue(),'St Saviour');
      assert.equal(await page.locator('[name=a-parishes_excluded]:checked').inputValue(),'St Ouen');
      const panelChoice=value=>page.locator(`[name="a-area_answer"][value="${value}"]`).click();
      await page.locator('#g-where').scrollIntoViewIfNeeded();await noOverflow();
      await page.screenshot({path:`${SHOTS}/panel-area-${width}.png`,fullPage:true});
      await nativeZoom('panel-area',width,'#g-where',async()=>{
        const selected=page.locator('[name=a-area_answer][value=selected]');
        await selected.focus();await focusUnobscured(selected);
        const fits=await page.locator('section[aria-labelledby="g-where"] .req-switch').first().evaluate(el=>{
          const r=el.getBoundingClientRect(), card=el.closest('section').getBoundingClientRect();
          return r.left>=card.left && r.right<=card.right;
        });
        assert.equal(fits,true,'priority switch remains inside the area card at native zoom');
      });
      await withDialog(()=>panelChoice('any'),false);
      assert.equal(await page.locator('[name=a-area_answer]:checked').inputValue(),'selected');
      await withDialog(()=>panelChoice('unknown'),true);
      await page.getByRole('button',{name:'Save',exact:true}).click();await page.getByText('Changes saved.',{exact:true}).waitFor();
      await page.reload();await page.locator('[name=a-area_answer]:checked').waitFor();
      assert.equal(await page.locator('[name=a-area_answer]:checked').inputValue(),'unknown');
      assert.equal(await page.locator('[name=a-parishes_excluded]:checked').inputValue(),'St Ouen');
      await panelChoice('any');
      await page.getByRole('button',{name:'Save',exact:true}).click();await page.getByText('Changes saved.',{exact:true}).waitFor();
      await page.reload();await page.locator('[name=a-area_answer]:checked').waitFor();
      assert.equal(await page.locator('[name=a-area_answer]:checked').inputValue(),'any');
      assert.equal(await page.locator('[name=a-parishes_excluded]:checked').inputValue(),'St Ouen');
      await panelChoice('unknown');
      await page.getByRole('button',{name:'Save',exact:true}).click();await page.getByText('Changes saved.',{exact:true}).waitFor();
      await page.reload();await page.locator('[name=a-area_answer]:checked').waitFor();
      assert.equal(await page.locator('[name=a-area_answer]:checked').inputValue(),'unknown');
      const recalc=await page.evaluate(async id=>{
        const r=await fetch(`/api/admin/applicants/${id}/matches/recalculate`,{method:'POST'});return r.status;
      },id);
      assert.equal(recalc,200);
      await ctx.close();ctx=null;await newPage(width);
      await page.goto(BASE+`admin/#/applicants/${id}/matches`);
      const pets=page.locator('.match .checks > div').filter({hasText:'Pets'}).first();await pets.waitFor();
      assert.match(await pets.textContent(),/Unknown/);
      const reviewButton=page.locator('.match-actions button').first();await reviewButton.focus();
      assert.equal(await reviewButton.evaluate(el=>el===document.activeElement),true);
      await page.keyboard.press('Tab');
      assert.equal(await page.locator('.match-actions button').nth(1).evaluate(el=>el===document.activeElement),true);
      await page.keyboard.press('Shift+Tab');assert.equal(await reviewButton.evaluate(el=>el===document.activeElement),true);
      await noOverflow();await nativeZoom('panel-pets',width,'.match .checks > div:has-text("Pets")',async()=>{
        await reviewButton.focus();await focusUnobscured(reviewButton);
        await page.keyboard.press('Tab');await focusUnobscured(page.locator('.match-actions button').nth(1));
        await page.keyboard.press('Shift+Tab');
      });
      assert.equal(await reviewButton.evaluate(el=>el===document.activeElement),true);
      await page.screenshot({path:`${SHOTS}/panel-pets-${width}.png`,fullPage:true});
      console.log(`REG-06 browser journey ${width}: passed`);
      await ctx.close();ctx=null;
    }
    assert.deepEqual(errors,[],'no page JavaScript errors');
    assert.deepEqual(consoleErrors,[],'no unexpected browser console errors');
    assert.deepEqual(localFailures,[],'no failed local requests');
  }finally{if(ctx)await ctx.close();await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
