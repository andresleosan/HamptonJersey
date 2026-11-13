// Synthetic local data only; run through test:e2e:isolated.
const {chromium} = require(process.env.PW || 'playwright-core');
const assert = require('node:assert/strict');
const {readFileSync} = require('node:fs');
const {parseEnv} = require('node:util');

(async()=>{
  assert.ok(process.env.BASE && process.env.E2E_VARS, 'isolated fixture required');
  const vars = parseEnv(readFileSync(process.env.E2E_VARS, 'utf8'));
  const {signSession, COOKIE} = await import('../server/auth.js');
  const browser = await chromium.launch({executablePath:process.env.CHROME});
  try {
    for (const width of [1280,390]) {
      const ctx = await browser.newContext({viewport:{width,height:900}, reducedMotion:'reduce'});
      await ctx.addCookies([{name:COOKIE, value:await signSession('admin@example.test',vars.SESSION_SECRET),
        domain:new URL(process.env.BASE).hostname, path:'/', httpOnly:true, secure:true, sameSite:'Strict'}]);
      await ctx.addInitScript(()=>{
        let visible = false;
        Object.defineProperty(document, 'visibilityState', {configurable:true,get:()=>visible?'visible':'hidden'});
        Object.defineProperty(document, 'hidden', {configurable:true,get:()=>!visible});
        const tracked = new Map(), set = window.setInterval.bind(window), clear = window.clearInterval.bind(window);
        window.setInterval = (fn,ms,...args)=>{
          const id = set(fn,ms,...args);
          if(ms === 30000 && typeof fn === 'function') tracked.set(id,()=>fn(...args));
          return id;
        };
        window.clearInterval = id=>{tracked.delete(id);return clear(id);};
        window.__adm03SetVisible = value=>{visible=value;document.dispatchEvent(new Event('visibilitychange'));};
        window.__adm03Tick = ()=>{for(const tick of [...tracked.values()]) tick();};
        window.__adm03Timers = ()=>tracked.size;
      });
      await ctx.route('https://fonts.googleapis.com/**',route=>route.fulfill({status:200,contentType:'text/css',body:''}));
      for(const screen of [
        {hash:'#/', title:'Inbox', path:'/api/admin/notifications'},
        {hash:'#/users', title:'Users with access', path:'/api/admin/notifications/counts'},
      ]) {
        const page = await ctx.newPage(), errors = [];
        let requests = 0;
        page.on('pageerror',error=>errors.push(`page error: ${error.message}`));
        page.on('console',message=>{if(message.type()==='error') errors.push('browser console error');});
        page.on('requestfailed',request=>{
          if(new URL(request.url()).origin===new URL(process.env.BASE).origin) errors.push('local request failed');
        });
        page.on('request',request=>{if(new URL(request.url()).pathname === screen.path) requests++;});
        await page.goto(new URL('admin/'+screen.hash,process.env.BASE).href);
        await page.getByRole('heading',{name:screen.title,exact:true}).waitFor();
        await page.waitForFunction(()=>window.__adm03Timers() > 0);
        await page.waitForTimeout(200);
        assert.equal(requests,0,`${screen.title}: hidden mount must not poll`);
        const response = ()=>page.waitForResponse(r=>new URL(r.url()).pathname === screen.path && r.status() === 200);
        await Promise.all([response(),page.evaluate(()=>window.__adm03SetVisible(true))]);
        assert.equal(requests,1,`${screen.title}: visible transition reloads immediately`);
        if(screen.title === 'Inbox') {
          const needs = page.getByRole('group',{name:'Notices'}).getByRole('button',{name:/^Needs action/});
          await needs.focus();
          assert.equal(await needs.evaluate(el=>el===document.activeElement),true);
          await page.keyboard.press('Tab');
          await page.keyboard.press('Shift+Tab');
          assert.equal(await needs.evaluate(el=>el===document.activeElement),true);
          await page.evaluate(()=>{document.documentElement.style.zoom='2';});
          assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Inbox reflows at CSS zoom 200%');
          await page.evaluate(()=>{document.documentElement.style.zoom='1';});
        }
        await page.evaluate(()=>{window.__adm03SetVisible(false);window.__adm03Tick();});
        await page.waitForTimeout(200);
        assert.equal(requests,1,`${screen.title}: hidden timer must not poll`);
        await Promise.all([response(),page.evaluate(()=>window.__adm03SetVisible(true))]);
        assert.equal(requests,2,`${screen.title}: returning visible reloads immediately`);
        await page.evaluate(()=>window.dispatchEvent(new Event('hs:signed-out')));
        await page.getByRole('dialog',{name:'Session expired'}).waitFor();
        await page.evaluate(()=>{window.__adm03SetVisible(false);window.__adm03Tick();window.__adm03SetVisible(true);});
        await page.waitForTimeout(200);
        assert.equal(requests,2,`${screen.title}: expired session stays paused`);
        assert.deepEqual(errors,[]);
        await page.close();
      }
      await ctx.close();
    }
  } finally {await browser.close();}
  console.log('ADM-03 Inbox and global counter hidden/visible/paused, 1280/390: PASS');
})().catch(error=>{console.error(error);process.exitCode=1;});
