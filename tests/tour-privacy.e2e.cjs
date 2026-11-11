const { chromium } = require(process.env.PW || 'playwright-core');
const assert = require('node:assert/strict');
const {execFileSync} = require('node:child_process');
const {mkdirSync} = require('node:fs');
const BASE = process.env.BASE;
(async () => {
  const browser = await chromium.launch();
  try {
    for (const width of [1280, 390]) {
      const ctx = await browser.newContext({viewport:{width,height:900}});
      const page = await ctx.newPage(), requests = [], errors = [];
      await page.emulateMedia({reducedMotion:'reduce'});
      page.on('pageerror', e => errors.push(e.message));
      await page.route('**/api/tours', route => route.fulfill({json:[
        {title:'First tour',url:'https://my.matterport.com/show/?m=fixture1'},
        {title:'Second tour',url:'https://player.vimeo.com/video/123?h=abc&dnt=0'}
      ]}));
      await page.route(/https:\/\/(my\.matterport\.com|player\.vimeo\.com|www\.youtube-nocookie\.com)\//, route => {
        requests.push(route.request().url());
        return route.fulfill({status:200,contentType:'text/html',body:'<!doctype html><title>Tour fixture</title>'});
      });
      await page.goto(BASE); await page.locator('#tour3d').waitFor();
      await page.locator('#tour3d').scrollIntoViewIfNeeded();
      assert.equal(await page.locator('#tour3d iframe').count(),0);
      assert.equal(requests.length,0);
      await page.evaluate(() => Object.defineProperty(navigator,'onLine',{value:false, configurable:true}));
      await page.getByRole('button',{name:'Load Matterport tour'}).click();
      assert.equal(await page.locator('#tour3d iframe').count(),0);
      assert.equal(requests.length,0);
      assert.match(await page.locator('#tour3d [role=alert]').textContent(), /offline/);
      await page.evaluate(() => Object.defineProperty(navigator,'onLine',{value:true, configurable:true}));
      await page.getByRole('button',{name:'Try again'}).click();
      try { await page.locator('#tour3d iframe').waitFor({timeout:8000}); } catch (error) { console.error('home gate state',width,await page.evaluate(() => ({gate:document.querySelector('#tour3d .tour-gate')?.textContent,frame:!!document.querySelector('#tour3d iframe'),stage:document.querySelector('#tour3d .tour3d-stage')?.getBoundingClientRect().toJSON()}))); throw error; }
      assert.equal(requests.length,1);
      await page.locator('#tour3d input[value="1"]').focus();
      await page.keyboard.press('Space');
      assert.equal(await page.locator('#tour3d input[value="1"]').isChecked(),true);
      assert.equal(await page.locator('#tour3d iframe').count(),0);
      assert.equal(requests.length,1);
      await page.getByRole('button',{name:'Load Vimeo tour'}).click();
      await page.locator('#tour3d iframe').waitFor();
      const vimeo = new URL(await page.locator('#tour3d iframe').getAttribute('src'));
      assert.equal(vimeo.searchParams.get('dnt'),'1'); assert.equal(vimeo.searchParams.get('h'),'abc');
      await page.getByRole('button',{name:'Unload tour'}).click();
      assert.equal(await page.locator('#tour3d iframe').count(),0);
      await page.goto(BASE+'p/HE-R001');
      await page.evaluate(() => Object.defineProperty(navigator,'onLine',{value:true, configurable:true}));
      await page.locator('#tab-tour').click();
      assert.equal(await page.locator('#stage iframe').count(),0);
      const previous = requests.length;
      await page.getByRole('button',{name:'Load Matterport tour'}).focus(); await page.keyboard.press('Enter');
      await page.locator('#stage iframe').waitFor(); assert.equal(requests.length,previous+1);
      await page.locator('#tab-aerial').click(); assert.equal(await page.locator('#stage iframe').count(),0);
      await page.locator('#tab-tour').click(); assert.equal(await page.locator('#stage iframe').count(),0);
      const beforeZoom = await page.evaluate(() => innerWidth);
      try {
        execFileSync('python3', ['tests/e2e-x11-zoom.py','in']);
        await page.waitForFunction(w => innerWidth <= w/2, beforeZoom);
        const loadTour = page.locator('#stage .tour-gate-button');
        await loadTour.scrollIntoViewIfNeeded();
        await loadTour.evaluate(el => el.scrollIntoView({block:'center',inline:'nearest'}));
        await loadTour.focus();
        await page.waitForFunction(() => { const el=document.querySelector('#stage .tour-gate-button'); if (!el) return false; const r=el.getBoundingClientRect(), hit=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2); return document.activeElement===el && (hit===el || el.contains(hit)); });
        const visible = await loadTour.evaluate(el => { const r=el.getBoundingClientRect(); const x=r.left+r.width/2, y=r.top+r.height/2, hit=document.elementFromPoint(x,y); return {top:r.top,bottom:r.bottom,height:innerHeight,focused:document.activeElement===el,unobscured:hit===el||el.contains(hit),hit:hit ? {tag:hit.tagName,classes:String(hit.className).slice(0,50),rect:hit.getBoundingClientRect().toJSON()} : null}; });
        assert.ok(visible.top>=0 && visible.bottom<=visible.height && visible.focused && visible.unobscured, `tour control not accessible: ${JSON.stringify(visible)}`);
        const controlBounds = await loadTour.evaluate(el => { const r=el.getBoundingClientRect(), p=el.closest('.tour-gate').getBoundingClientRect(); return {top:r.top,bottom:r.bottom,parentTop:p.top,parentBottom:p.bottom}; });
        assert.ok(controlBounds.top >= controlBounds.parentTop-1 && controlBounds.bottom <= controlBounds.parentBottom+1, `tour button clipped: ${JSON.stringify(controlBounds)}`);
        if (process.env.E2E_SHOTS) { mkdirSync(process.env.E2E_SHOTS, {recursive:true}); execFileSync('python3',['tests/e2e-x11-screenshot.py',`${process.env.E2E_SHOTS}/pre11-tour-focus-${width}.png`,String(width),'900']); }
        const dimensions = await page.evaluate(() => ({viewport:innerWidth, scroll:document.documentElement.scrollWidth, scrollX, client:document.documentElement.clientWidth, body:document.body.getBoundingClientRect().toJSON(), bodyScroll:document.body.scrollWidth, propertyChildren:[...document.querySelector('form.tour label.field').children].map(e=>({tag:e.tagName,width:e.clientWidth,scroll:e.scrollWidth,rect:e.getBoundingClientRect().toJSON(),overflow:getComputedStyle(e).overflowX})), overflowBoxes:[...document.querySelectorAll('body *')].filter(e=>e.scrollWidth>e.clientWidth+1 && getComputedStyle(e).overflowX==='visible' && !e.closest('.media-tabs,.opts.days')).slice(0,20).map(e=>({tag:e.tagName,classes:String(e.className).slice(0,50),label:e.matches('label.field') ? e.querySelector('span')?.textContent : undefined,width:e.clientWidth,scroll:e.scrollWidth})), scrollParents:[...document.querySelectorAll('.media-tabs,.opts.days')].map(e=>({kind:e.className,rect:e.getBoundingClientRect().toJSON(),scroll:e.scrollWidth,client:e.clientWidth})), offenders:[...document.querySelectorAll('body *')].filter(e => e.getBoundingClientRect().right + scrollX > innerWidth+2 && !e.closest('.media-tabs, .opts.days')).slice(0,16).map(e => ({tag:e.tagName, classes:String(e.className).slice(0,60), right:Math.round(e.getBoundingClientRect().right + scrollX)}))}));
        assert.ok(dimensions.scroll <= dimensions.viewport, `native zoom overflow ${width}: ${JSON.stringify(dimensions)}`);
        const property = page.locator('#detail-slot select[name=prop]');
        await property.focus();
        assert.equal(await property.evaluate(el => document.activeElement === el), true, 'property selector remains keyboard-focusable');
        assert.ok(await property.evaluate(el => { const r=el.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth+1; }), 'property selector fits the viewport');
        if (process.env.E2E_SHOTS) { mkdirSync(process.env.E2E_SHOTS, {recursive:true}); execFileSync('python3',['tests/e2e-x11-screenshot.py',`${process.env.E2E_SHOTS}/pre11-property-focus-${width}.png`,String(width),'900']); }
        console.log(`PRE-11 ${width}: native zoom above 200% fits viewport PASS`);
      } finally {
        execFileSync('python3', ['tests/e2e-x11-zoom.py','reset']);
      }
      await page.evaluate(() => { document.documentElement.style.zoom='2'; });
      const geometry = await page.evaluate(() => { const gate=document.querySelector('.tour-gate'); const rect=gate.getBoundingClientRect(); return {viewport:innerWidth, left:rect.left, right:rect.right, content:gate.scrollWidth, width:gate.clientWidth}; });
      assert.ok(geometry.content <= geometry.width+1, JSON.stringify(geometry));
      if (geometry.right > geometry.viewport+1) console.log(`PRE-11 ${width}: page exceeds viewport at CSS zoom 200%; source not isolated`);
      assert.deepEqual(errors,[]);
      console.log(`PRE-11 ${width}: explicit load, provider switching, unload, keyboard, local detail and zoom PASS`);
      await ctx.close();
    }
  } finally { await browser.close(); }
})().catch(e=>{console.error(e);process.exitCode=1;});
