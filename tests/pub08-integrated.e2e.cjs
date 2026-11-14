// Real Pages routes, D1 and R2 in the disposable offline fixture. Only the
// external video/tour player documents are intercepted; application APIs are not.
const { chromium } = require(process.env.PW || 'playwright-core');
const assert = require('node:assert/strict');
const { readFileSync, mkdirSync } = require('node:fs');
const { parseEnv } = require('node:util');
const { join } = require('node:path');
const { execFileSync } = require('node:child_process');
const BASE = process.env.BASE;
assert.equal(process.env.E2E_PRODUCTION_READONLY, '0', 'local fixture required');
assert.equal(process.env.HAMPTON_E2E_ISOLATED, '1', 'isolated container required');
assert.ok(process.env.E2E_PERSIST && process.env.E2E_VARS, 'disposable D1/R2 fixture required');
assert.ok(BASE && new URL(BASE).protocol === 'https:' && ['localhost', '127.0.0.1', '[::1]'].includes(new URL(BASE).hostname));
const vars = parseEnv(readFileSync(process.env.E2E_VARS, 'utf8'));
const photo = [...readFileSync(join(__dirname, 'fixtures/media-upload/baseline.jpg'))];
const thumb = [...readFileSync(join(__dirname, 'fixtures/media-upload/thumb.jpg'))];
const PROVIDERS = /^https:\/\/(player\.vimeo\.com|www\.youtube-nocookie\.com|my\.matterport\.com)\//;
const VIDEO = 'https://player.vimeo.com/video/123456789';
const TOUR = 'https://my.matterport.com/show/?m=PUB08FIXTURE';
const request = (page, path, method = 'GET', body) => page.evaluate(async ({path, method, body}) => {
  const response = await fetch(path, { method, credentials:'same-origin', cache:'no-store',
    headers: body === undefined ? undefined : {'content-type':'application/json'},
    body: body === undefined ? undefined : JSON.stringify(body) });
  return {status:response.status, data:await response.json()};
}, {path, method, body});
async function save(page, id, expectedStatus) {
  const pending = page.waitForResponse(response => response.request().method() === 'PUT' &&
    new URL(response.url()).pathname === `/api/admin/listings/${id}`);
  await page.getByRole('button', {name:'Save', exact:true}).click();
  const response = await pending;
  assert.equal(response.status(), expectedStatus, `actual listing save returned ${response.status()}`);
  return response.json();
}
async function focusAndReflow(page, target, zoom = false) {
  if (zoom) await page.evaluate(() => { document.documentElement.style.zoom = '2'; });
  await target.scrollIntoViewIfNeeded(); await target.focus();
  assert.equal(await target.evaluate(element => document.activeElement === element), true, 'control retains keyboard focus');
  const overflow = await page.evaluate(() => ({ width: innerWidth, scroll: document.documentElement.scrollWidth,
    elements: [...document.body.querySelectorAll('*')].filter(el => {
      const r=el.getBoundingClientRect();return r.width && r.height && (r.right>innerWidth+1 || r.left < -1);
    }).slice(0,12).map(el=>({tag:el.tagName,id:el.id,className:el.className,
      right:Math.round(el.getBoundingClientRect().right),text:el.textContent.slice(0,90)})) }));
  if (overflow.scroll > overflow.width + 1) await shot(page,'pub08-integrated-overflow.png');
  assert.ok(overflow.scroll <= overflow.width + 1, `page has no horizontal overflow: ${JSON.stringify(overflow)}`);
  assert.ok(await target.evaluate(element => {const r=element.getBoundingClientRect();return r.left>=-1 && r.right<=innerWidth+1;}),
    'focused control stays within the viewport');
}
async function shot(page, name) {
  if (!process.env.E2E_SHOTS) return;
  mkdirSync(process.env.E2E_SHOTS, {recursive:true});
  await page.screenshot({path:join(process.env.E2E_SHOTS,name),fullPage:true});
}
(async () => {
  const {signSession, COOKIE} = await import('../server/auth.js');
  const browser = await chromium.launch();
  try {
    for (const width of [1280, 390]) {
      const errors = [], failedResources = [], providerRequests = [], expectedApiErrors = new Set();
      let resizeWarnings = 0, offlineIdentityWarnings = 0;
      function observe(page) {
        page.setDefaultTimeout(20000);
        page.on('pageerror', error => {
          if (process.env.HAMPTON_E2E_BROWSER === 'webkit' &&
              error.message === 'ResizeObserver loop completed with undelivered notifications.') { resizeWarnings++; return; }
          errors.push(error.message);
        });
        page.on('console', message => {
          if (message.type() !== 'error') return;
          const text=message.text(), url=message.location().url || '';
          const fixtureFont = process.env.E2E_OFFLINE_FONTS === '1' &&
            (/^https:\/\/fonts\.(googleapis|gstatic)\.com\//.test(url) ||
              /^Failed to preconnect to https:\/\/fonts\.(googleapis|gstatic)\.com\//.test(text));
          // Staff use signed fictitious server sessions. Google login itself is
          // outside this networkless content test; keep its precise DNS notice
          // separate while all application failures continue to fail the test.
          const fixtureIdentity = process.env.HAMPTON_E2E_ISOLATED === '1' &&
            /^Failed to load resource: Error resolving [“"]apis\.google\.com[”"]: Name or service not known$/.test(text);
          if(fixtureIdentity) {offlineIdentityWarnings++;return;}
          const expectedApi = /Failed to load resource/.test(text) &&
            expectedApiErrors.has(new URL(url || BASE, BASE).pathname) && /\b(400|409)\b/.test(text);
          if (!fixtureFont && !expectedApi) errors.push(text);
        });
        page.on('response', response => {
          if (response.status() < 400) return;
          const url = new URL(response.url());
          if (expectedApiErrors.has(url.pathname) && [400,409].includes(response.status())) return;
          if (process.env.E2E_OFFLINE_FONTS === '1' && /^fonts\.(googleapis|gstatic)\.com$/.test(url.hostname)) return;
          failedResources.push(`${response.status()} ${url.pathname}`);
        });
      }
      async function context(email) {
        const ctx = await browser.newContext({viewport:{width,height:900},reducedMotion:'reduce'});
        if (email) await ctx.addCookies([{name:COOKIE,value:await signSession(email,vars.SESSION_SECRET),
          domain:new URL(BASE).hostname,path:'/',secure:true,httpOnly:true,sameSite:'Strict'}]);
        await ctx.route(PROVIDERS, route => {
          providerRequests.push(route.request().url());
          return route.fulfill({status:200,contentType:'text/html',body:'<!doctype html><title>Synthetic external player</title>'});
        });
        return ctx;
      }
      const primary = await context('admin@example.test'), secondary = await context('colleague@example.test');
      const page = await primary.newPage(), colleague = await secondary.newPage();observe(page);observe(colleague);
      await page.goto(BASE+'robots.txt');
      const title = `PUB-08 integrated fixture ${width}`;
      const created = await request(page, '/api/admin/listings', 'POST', {title,use:'residential',operation:'sale',
        availability:'for_sale',country:'Jersey',location:'St Helier',property_type:'Flat',bedrooms:2,bathrooms:1,
        sale_price:500000,currency:'GBP',description:'Synthetic integrated content fixture.',tour_url:TOUR,specs:[]});
      assert.equal(created.status,201);const id=created.data.id, path=`/api/admin/listings/${id}`;
      expectedApiErrors.add(path);
      const uploaded = await page.evaluate(async ({path,photo,thumb}) => {
        const form = new FormData();
        form.append('file',new File([new Uint8Array(photo)],'fixture.jpg',{type:'image/jpeg'}));
        form.append('thumb',new File([new Uint8Array(thumb)],'thumb.jpg',{type:'image/jpeg'}));
        form.append('label','Synthetic fixture photo');
        const response=await fetch(path+'/media',{method:'POST',body:form});
        return {status:response.status,data:await response.json()};
      }, {path,photo,thumb});
      assert.equal(uploaded.status,201,'fixture photo uses the real validated upload route and local R2');
      let detail=await request(page,path);assert.equal(detail.status,200);assert.equal(detail.data.content_tracking,true);
      assert.deepEqual(detail.data.content,{tags:[],video_url:null});
      const published=await request(page,path+'/publish','POST',{updated_at:detail.data.listing.updated_at});
      assert.equal(published.status,200,'only the disposable synthetic property is published');
      const before=(await request(page,path)).data;
      await page.goto(BASE+`admin/#/p/${id}`);await colleague.goto(BASE+`admin/#/p/${id}`);
      await page.getByRole('heading',{name:'Website content',exact:true}).waitFor();
      await colleague.getByRole('heading',{name:'Website content',exact:true}).waitFor();
      const sea=page.getByLabel('Sea view',{exact:true}), url=page.getByLabel('Video player URL',{exact:true});
      await sea.focus();await page.keyboard.press('Space');assert.equal(await sea.isChecked(),true);
      await url.fill('https://unsupported.example.test/video/123');
      await page.getByRole('status').filter({hasText:'Use a supported Vimeo or privacy-enhanced YouTube player URL'}).waitFor();
      await save(page,id,400);
      await page.getByRole('alert').filter({hasText:'Use a supported Vimeo or privacy-enhanced YouTube player URL'}).waitFor();
      assert.equal(await url.getAttribute('aria-invalid'),'true');assert.equal(await sea.isChecked(),true);
      const rejected=(await request(page,path)).data;
      assert.deepEqual(rejected.content,before.content);assert.equal(rejected.listing.updated_at,before.listing.updated_at);
      await url.fill(VIDEO);const saved=await save(page,id,200);
      await page.getByRole('status').filter({hasText:'Changes saved.'}).waitFor();
      assert.deepEqual(saved.content,{tags:['sea_view'],video_url:VIDEO});
      assert.equal(saved.listing.tour_url,TOUR);assert.notEqual(saved.listing.updated_at,before.listing.updated_at);
      detail=await request(page,path);assert.equal(detail.status,200);assert.equal(detail.data.content_tracking,true);
      assert.deepEqual(detail.data.content,saved.content);assert.equal(detail.data.listing.updated_at,saved.listing.updated_at);
      assert.equal(await page.locator('iframe').count(),0);assert.deepEqual(providerRequests,[]);

      const otherUrl=colleague.getByLabel('Video player URL',{exact:true});
      const otherTag=colleague.getByLabel('Town centre',{exact:true});
      await otherTag.check();await otherUrl.fill('https://www.youtube-nocookie.com/embed/fixture');
      await save(colleague,id,409);
      await colleague.getByRole('alert').filter({hasText:/changed|Reload|saved changes/}).first().waitFor();
      assert.equal(await otherTag.isChecked(),true);
      assert.equal(await otherUrl.inputValue(),'https://www.youtube-nocookie.com/embed/fixture','conflicting draft survives');
      assert.equal(await colleague.getByLabel('Sea view',{exact:true}).isChecked(),false);
      const afterConflict=(await request(colleague,path)).data;
      assert.deepEqual(afterConflict.content,saved.content);assert.equal(afterConflict.listing.updated_at,saved.listing.updated_at);
      await shot(colleague,`pub08-integrated-conflict-${width}.png`);
      await colleague.getByRole('button',{name:'Discard',exact:true}).click();
      await colleague.reload();await colleague.getByRole('heading',{name:'Website content',exact:true}).waitFor();
      assert.equal(await colleague.getByLabel('Sea view',{exact:true}).isChecked(),true);
      assert.equal(await colleague.getByLabel('Town centre',{exact:true}).isChecked(),false);
      assert.equal(await colleague.getByLabel('Video player URL',{exact:true}).inputValue(),VIDEO,'second staff session reads the committed content');
      await focusAndReflow(page,url,width===1280);await shot(page,`pub08-integrated-editor-${width}.png`);

      const publicContext=await context(), publicPage=await publicContext.newPage();observe(publicPage);
      const publicResponse=await request(page,'/api/listings');assert.equal(publicResponse.status,200);
      const dto=publicResponse.data.find(item=>item.id===id);assert.ok(dto,'new property appears through the real public route');
      assert.deepEqual(dto.tags,['Sea view']);assert.equal(dto.videoUrl,VIDEO);assert.equal(dto.tourUrl,TOUR);
      await publicPage.goto(BASE+`p/${id}`);
      await publicPage.locator('.summary').getByText('Sea view',{exact:true}).waitFor();
      const video=publicPage.getByRole('tab',{name:'Video',exact:true}), tour=publicPage.getByRole('tab',{name:'3D tour',exact:true});
      await video.waitFor();await tour.waitFor();
      const decoded=await publicPage.evaluate(async mid=>{
        const response=await fetch('/media/'+mid),bitmap=await createImageBitmap(await response.blob());
        const result={status:response.status,width:bitmap.width,height:bitmap.height};bitmap.close();return result;
      },uploaded.data.media.id);
      assert.deepEqual(decoded,{status:200,width:32,height:24},'anonymous public media comes from real local R2');
      assert.equal(await publicPage.locator('iframe').count(),0);assert.deepEqual(providerRequests,[]);
      await video.focus();await publicPage.keyboard.press('Enter');
      const load=publicPage.getByRole('button',{name:'Load Vimeo video',exact:true});await load.waitFor();
      assert.equal(await publicPage.locator('#stage iframe').count(),0);assert.deepEqual(providerRequests,[],'selecting Video makes no provider request');
      await publicPage.evaluate(()=>Object.defineProperty(navigator,'onLine',{value:false,configurable:true}));
      await load.focus();await publicPage.keyboard.press('Enter');
      await publicPage.getByRole('alert').filter({hasText:'You appear to be offline.'}).waitFor();
      assert.equal(await publicPage.locator('#stage iframe').count(),0);assert.deepEqual(providerRequests,[],'offline consent does not contact the provider');
      // Only the fixture's connection signal changes; the container remains
      // networkless and the provider document is still a synthetic interception.
      await publicPage.evaluate(()=>Object.defineProperty(navigator,'onLine',{value:true,configurable:true}));
      const providerRequest=publicPage.waitForRequest(request=>new URL(request.url()).hostname==='player.vimeo.com');
      await publicPage.getByRole('button',{name:'Try again',exact:true}).focus();
      await publicPage.keyboard.press('Enter');await providerRequest;
      const frame=publicPage.locator('#stage iframe');await frame.waitFor();
      assert.equal(await frame.getAttribute('title'),`Video: ${title}`);
      assert.equal(new URL(await frame.getAttribute('src')).searchParams.get('dnt'),'1');
      assert.equal(providerRequests.length,1);assert.equal(new URL(providerRequests[0]).hostname,'player.vimeo.com');
      await publicPage.getByRole('button',{name:'Unload video',exact:true}).click();await frame.waitFor({state:'detached'});
      await tour.focus();await publicPage.keyboard.press('Enter');
      await publicPage.getByRole('button',{name:/Load Matterport tour/}).waitFor();
      assert.equal(await publicPage.locator('#stage iframe').count(),0);assert.equal(providerRequests.length,1,'the separate tour also waits for consent');
      await video.focus();await publicPage.keyboard.press('Enter');await load.waitFor();
      if(width===1280 && process.env.HAMPTON_E2E_BROWSER==='webkit') {
        const beforeZoom=await publicPage.evaluate(()=>innerWidth);
        await publicPage.bringToFront();
        try {
          execFileSync('python3',['tests/e2e-x11-zoom.py','in']);
          await publicPage.waitForFunction(width=>innerWidth<=width/2,beforeZoom);
          await focusAndReflow(publicPage,load);await shot(publicPage,`pub08-integrated-public-${width}-native-zoom.png`);
        } finally {execFileSync('python3',['tests/e2e-x11-zoom.py','reset']);}
      } else {
        // CSS zoom does not update media queries. For headless Chromium use the
        // effective CSS viewport; the separate WebKit run verifies native 200%.
        if(width===1280)await publicPage.setViewportSize({width:640,height:900});
        await focusAndReflow(publicPage,load);await shot(publicPage,`pub08-integrated-public-${width}.png`);
      }
      assert.deepEqual(failedResources,[],'no unexpected failed application resources');assert.deepEqual(errors,[],'no unexpected browser errors');
      if(resizeWarnings)console.log(`Known WebKit ResizeObserver fixture notices: ${resizeWarnings}`);
      if(offlineIdentityWarnings)console.log(`Offline Google login bootstrap notices (server-session fixture): ${offlineIdentityWarnings}`);
      await publicContext.close();await secondary.close();await primary.close();
    }
    console.log('PUB-08 integrated real routes, D1/R2, CAS, provider consent and keyboard 1280/390: PASS (synthetic; editor CSS zoom, public native WebKit/effective viewport Chromium).');
  } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
