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
    const page=await ctx.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));page.setDefaultTimeout(15000);
    await page.goto(BASE+'admin/#/p/HE-R001');
    await page.getByRole('navigation',{name:'Listing sections'}).waitFor();
    assert.equal(await page.getByRole('heading',{name:'Website content'}).count(),0,'flag off hides content editor');
    let original,attempts=0;
    await page.route('**/api/admin/listings/HE-R001',async route=>{
      if(route.request().method()==='GET'){
        const response=await route.fetch();original=await response.json();
        return route.fulfill({response,json:{...original,content_tracking:true,content:{tags:[],video_url:null}}});
      }
      if(route.request().method()==='PUT'){
        const body=route.request().postDataJSON();
        assert.deepEqual(Object.keys(body).sort(),['content','updated_at']);
        assert.deepEqual(body.content,{tags:['sea_view'],video_url:'https://player.vimeo.com/video/123'});
        attempts++;
        if(attempts===1) return route.fulfill({status:409,json:{error:'Someone else saved changes. Reload to see them.'}});
        return route.fulfill({json:{listing:{...original.listing,updated_at:'2026-11-12T12:00:00.001Z'},
          details:original.details,content:body.content,content_tracking:true}});
      }
      return route.continue();
    });
    await page.reload();
    await page.getByRole('heading',{name:'Website content'}).waitFor();
    const tag=page.getByLabel('Sea view',{exact:true}),url=page.getByLabel('Video player URL');
    await tag.focus();await page.keyboard.press('Space');assert.equal(await tag.isChecked(),true);
    await url.fill('https://unsupported.example.test/video/123');
    await page.getByRole('status').filter({hasText:'Use a supported Vimeo or privacy-enhanced YouTube player URL'}).waitFor();
    assert.equal(await page.locator('iframe').count(),0);
    await url.fill('https://player.vimeo.com/video/123');
    await page.getByRole('button',{name:'Save',exact:true}).click();
    await page.getByRole('alert').filter({hasText:'Someone else saved changes'}).waitFor();
    assert.equal(await tag.isChecked(),true);assert.equal(await url.inputValue(),'https://player.vimeo.com/video/123');
    await page.getByRole('button',{name:'Discard',exact:true}).click();
    assert.equal(await tag.isChecked(),false);assert.equal(await url.inputValue(),'');
    await tag.check();await url.fill('https://player.vimeo.com/video/123');
    await page.getByRole('button',{name:'Save',exact:true}).click();
    await page.getByText('Changes saved.',{exact:true}).waitFor();
    assert.equal(attempts,2);assert.equal(await tag.isChecked(),true);
    assert.equal(await page.locator('iframe').count(),0);
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    if(width===1280){
      await page.evaluate(()=>{document.documentElement.style.zoom='2';});
      await url.scrollIntoViewIfNeeded();
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'editor reflows at CSS zoom 200%');
    }
    assert.deepEqual(errors,[]);await ctx.close();
  }} finally {await browser.close();}
  console.log('PUB-08 synthetic editor draft/save 1280/390: PASS');
})().catch(error=>{console.error(error);process.exitCode=1;});
