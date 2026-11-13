// Synthetic local editor session. Content API responses are intercepted here;
// the real routes, transaction and concurrency are covered by server tests.
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
    let fontFixtureLoads=0;
    await ctx.route('https://fonts.googleapis.com/**',route=>{
      fontFixtureLoads++;
      return route.fulfill({status:200,contentType:'text/css',body:'/* Offline fixture: use the existing fallback fonts. */'});
    });
    const page=await ctx.newPage(), errors=[], writes=[], badResponses=[], diagnostics=[];
    const deliberate404=new Set();
    let expected404Url=null, expected404ConsoleBudget=0;
    const safeLocation=raw=>{
      try {
        const u=new URL(raw), local=u.origin===new URL(BASE).origin;
        if(local && /^\/api\/admin\/chats\/\d+\/applicant-draft$/.test(u.pathname))
          return {origin:'local-fixture',path:'/api/admin/chats/:id/applicant-draft'};
        if(local && u.pathname==='/api/admin/applicants') return {origin:'local-fixture',path:'/api/admin/applicants'};
        if(local && u.pathname==='/admin/') return {origin:'local-fixture',path:'/admin/'};
        if(local && u.pathname.startsWith('/admin/assets/')) return {origin:'local-fixture',path:'/admin/assets/:asset'};
        if(u.origin==='https://fonts.googleapis.com') return {origin:u.origin,path:u.pathname==='/css2'?'/css2':'[redacted]'};
        if(u.origin==='https://fonts.gstatic.com') return {origin:u.origin,path:'/s/:font'};
        return {origin:local?'local-fixture':'other-external',path:'[redacted]'};
      } catch { return {origin:'unknown',path:'[redacted]'}; }
    };
    const code=value=>{
      const text=String(value||''), network=text.match(/(?:net::)?ERR_[A-Z0-9_]{1,64}/)?.[0];
      const http=text.match(/\b(?:status(?: of)?|HTTP(?: status)?)\s*(?:code\s*)?([45]\d\d)\b/i)?.[1];
      return network || (http ? `HTTP_${http}` : 'OTHER');
    };
    const diagnostic=(kind,raw,reason)=>{
      const item={kind,code:code(reason),...safeLocation(raw)};diagnostics.push(item);
      console.warn('MSG-05 browser diagnostic:',JSON.stringify(item));
    };
    page.on('pageerror',()=>errors.push('exception'));
    page.on('console',m=>{
      if(m.type()!=='error') return;
      const location=m.location().url, reason=code(m.text());
      const expected=reason==='HTTP_404' && expected404ConsoleBudget>0 && location===expected404Url;
      if(expected) expected404ConsoleBudget--;
      diagnostic(expected?'expected-console':'console',location,m.text());
    });
    page.on('requestfailed',r=>diagnostic('requestfailed',r.url(),r.failure()?.errorText));
    page.on('response',r=>{
      if(r.status()===404 && deliberate404.has(r.request())) {
        expected404Url=r.url();expected404ConsoleBudget++;return;
      }
      if(r.status()>=400) badResponses.push({status:r.status(),...safeLocation(r.url())});
    });
    page.on('request',r=>{if(r.method()!=='GET' && new URL(r.url()).pathname==='/api/admin/applicants') writes.push(r.method());});
    page.setDefaultTimeout(10000);
    await page.route('**/api/admin/chats**', async route=>{
      const u=new URL(route.request().url()), path=u.pathname;
      if(path.endsWith('/applicant-draft')) return route.fulfill({json:{chat_id:987,chat_version:null,
        contact:{name:'Synthetic Visitor',email:'synthetic.visitor@example.test',phone:'+447700900456'},
        fields:{},provenance:{contact:'chat',fields:'none'},save_available:false}});
      if(path.endsWith('/987')) return route.fulfill({json:{chat:{id:987,name:'Synthetic Visitor',
        email:'synthetic.visitor@example.test',phone:'+447700900456',status:'waiting',created_at:'2026-11-01T12:00:00Z'},messages:[]}});
      return route.fulfill({json:{chats:[{id:987,name:'Synthetic Visitor',status:'waiting',last_at:'2026-11-01T12:00:00Z',waiting_since:'2026-11-01T12:00:00Z'}],counts:{waiting:1,answered:0,handled:0}}});
    });
    await page.goto(BASE+'admin/#/messages');
    await page.getByRole('link',{name:'Review chat contact'}).focus();
    await page.keyboard.press('Enter');
    await page.waitForFunction(()=>location.hash==='#/applicants/new?chat=987');
    assert.equal(new URL(page.url()).hash,'#/applicants/new?chat=987');
    await page.locator('#a-name').waitFor();
    await page.getByRole('heading',{name:'Review chat contact',exact:true}).waitFor();
    await page.getByRole('status').filter({hasText:'creating an applicant from chat is not yet available'}).waitFor();
    const summary=page.getByRole('region',{name:'Chat contact'});
    await summary.waitFor();
    assert.ok(await summary.getByText('Synthetic Visitor',{exact:true}).isVisible());
    assert.ok(await summary.getByText('synthetic.visitor@example.test',{exact:true}).isVisible());
    assert.equal(await page.locator('#a-name').inputValue(),'Synthetic Visitor');
    assert.equal(await page.locator('#a-email').inputValue(),'synthetic.visitor@example.test');
    assert.equal(await page.locator('#a-phone').inputValue(),'+447700900456');
    assert.equal(await page.locator('#a-requirements').inputValue(),'');
    assert.equal(await page.getByRole('button',{name:'Save applicant'}).isDisabled(),true);
    assert.equal(await page.getByLabel('They were told how we use their details and accept the privacy notice').isChecked(),false);
    assert.equal(await page.getByLabel('They agree to hear about new homes and news from Hampton Estates (optional)').isChecked(),false);
    assert.equal(await page.locator('input[name="n-source"]:checked').count(),0);
    const storage=await page.evaluate(()=>JSON.stringify({...localStorage,...sessionStorage}));
    for(const value of ['Synthetic Visitor','synthetic.visitor@example.test','+447700900456']){
      assert.ok(!decodeURIComponent(page.url()).includes(value));
      assert.ok(!storage.includes(value));
    }
    await page.locator('form').evaluate(form=>form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
    assert.deepEqual(writes,[]);
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
    if(process.env.E2E_SHOTS) await page.screenshot({path:process.env.E2E_SHOTS+'/msg05-'+width+'.png'});
    if(width===1280){
      await page.evaluate(()=>{document.documentElement.style.zoom='2';});
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
    }
    await page.getByRole('link',{name:'Cancel',exact:true}).click();
    await page.getByRole('heading',{name:'Applicants',exact:true}).waitFor();
    assert.deepEqual(writes,[]);
    await page.goto(BASE+'admin/#/applicants/new');
    assert.equal(await page.getByRole('button',{name:'Add applicant',exact:true}).isEnabled(),true);
    assert.equal(await page.locator('#a-name').isEnabled(),true);
    await page.locator('input[name="n-source"][value="phone"]').check();
    await page.locator('input[name="a-operation"][value="rent"]').check();
    await page.locator('input[name="a-area_answer"][value="unknown"]').check();
    await page.locator('#a-name').fill('Synthetic Ordinary');
    await page.locator('#a-email').fill(`ordinary-${width}@example.test`);
    const created=page.waitForResponse(r=>r.request().method()==='POST' && new URL(r.url()).pathname==='/api/admin/applicants');
    await page.getByRole('button',{name:'Add applicant',exact:true}).click();
    assert.equal((await created).status(),201,'ordinary applicant creation works');
    await page.waitForFunction(()=>/^#\/applicants\/\d+$/.test(location.hash));
    assert.deepEqual(writes,['POST']);
    if(width===1280){
      await page.unroute('**/api/admin/chats**');
      let firstRoute, release, announce, count=0;
      const held=new Promise(resolve=>announce=resolve), wait=new Promise(resolve=>release=resolve);
      await page.route('**/api/admin/chats/987/applicant-draft',async route=>{
        if(++count===1){firstRoute=route;announce();await wait;return;}
        await route.fulfill({json:{chat_id:987,chat_version:null,contact:{name:'Synthetic Visitor',
          email:'synthetic.visitor@example.test',phone:'+447700900456'},fields:{},
          provenance:{contact:'chat',fields:'none'},save_available:false}});
      });
      await page.goto(BASE+'admin/#/applicants/new?chat=987');
      await held;
      await page.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));
      await page.locator('#a-name').waitFor();
      deliberate404.add(firstRoute.request());
      await firstRoute.fulfill({status:404,json:{error:'This chat was deleted'}});release();
      await page.getByRole('alert').filter({hasText:'This chat is no longer available.'}).waitFor();
      assert.equal(await page.locator('#a-name').count(),0,'a late deletion clears the proposal');
      await page.goto(BASE+'admin/#/applicants/new?chat=invalid');
      await page.getByRole('alert').filter({hasText:'This chat link is invalid.'}).waitFor();
    }
    assert.ok(fontFixtureLoads>0,'local stylesheet fixture replaced the unavailable remote font CSS');
    assert.equal(errors.length,0,'no page exceptions');
    assert.deepEqual(badResponses,[],'no unexpected HTTP errors');
    assert.equal(diagnostics.filter(d=>d.kind==='requestfailed').length,0,'no failed browser requests');
    assert.equal(diagnostics.filter(d=>d.kind==='console').length,0,'no unexpected console errors');
    await ctx.close();
  }} finally {await browser.close();}
  console.log('MSG-05 synthetic private draft 1280/390: PASS');
})().catch(e=>{const place=String(e.stack||'').match(/msg-05-draft\.e2e\.cjs:\d+:\d+/)?.[0];console.error('MSG-05 test failed:',e.name,place||'unknown location');process.exitCode=1;});
