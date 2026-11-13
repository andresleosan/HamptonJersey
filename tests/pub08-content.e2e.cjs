// PUB-08 synthetic fixture only; run with test:e2e:isolated.
const {chromium}=require(process.env.PW||'playwright-core');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {execFileSync}=require('node:child_process');
const BASE=process.env.BASE;
const photo=fs.readFileSync('tests/fixtures/photo.jpg');
const listing={id:'HE-R001',title:'Fixture home',region:'jersey',place:'St Helier',operation:'sale',use:'residential',
  status:'For Sale',beds:2,baths:1,type:'Flat',salePrice:500000,currency:'GBP',
  image:'/media/PUB08',thumb:'/media/PUB08',photos:[{src:'/media/PUB08',thumb:'/media/PUB08',alt:'Fixture room'}],
  summary:[],description:[],specs:[],floorplans:[],tags:['Sea view'],videoUrl:'https://player.vimeo.com/video/123',
  tourUrl:'https://my.matterport.com/show/?m=fixture',viewingsEnabled:true};
(async()=>{
  const browser=await chromium.launch(process.env.CHROME?{executablePath:process.env.CHROME}:{});
  try {
    for(const width of [1280,390]){
      const ctx=await browser.newContext({viewport:{width,height:900},reducedMotion:'reduce'});
      await ctx.addInitScript(()=>Object.defineProperty(navigator,'onLine',{value:true,configurable:true}));
      const page=await ctx.newPage(),errors=[],thirdParty=[];
      // WebKit may emit this known layout notification while the existing gallery settles.
      // Keep collecting all other page errors; this does not verify production behavior.
      let resizeWarnings=0;
      page.on('pageerror',error=>{
        if(process.env.HAMPTON_E2E_BROWSER==='webkit' && error.message==='ResizeObserver loop completed with undelivered notifications.') { resizeWarnings++; return; }
        errors.push(error.message);
      });
      await page.route('**/api/listings',route=>route.fulfill({json:[listing]}));
      await page.route('**/media/PUB08*',route=>route.fulfill({body:photo,contentType:'image/jpeg'}));
      await page.route(/^https:\/\/(player\.vimeo\.com|my\.matterport\.com)\//,route=>{
        thirdParty.push(new URL(route.request().url()).hostname);
        return route.fulfill({status:200,contentType:'text/html',body:'<!doctype html><title>Fixture</title>'});
      });
      await page.goto(BASE+'p/HE-R001');
      await page.locator('.summary').waitFor();
      assert.equal(await page.locator('.summary').getByText('Sea view',{exact:true}).count(),1);
      const video=page.getByRole('tab',{name:'Video',exact:true});await video.waitFor();
      assert.equal(await page.locator('iframe').count(),0);assert.deepEqual(thirdParty,[]);
      await video.focus();await page.keyboard.press('Enter');
      assert.equal(await page.locator('#stage iframe').count(),0);assert.deepEqual(thirdParty,[]);
      await page.getByRole('button',{name:'Load Vimeo video'}).click();
      await page.locator('#stage iframe').waitFor();
      assert.equal(thirdParty.includes('player.vimeo.com'),true);
      assert.equal(await page.locator('#stage iframe').getAttribute('title'),'Video: Fixture home');
      await page.getByRole('button',{name:'Unload video'}).click();
      assert.equal(await page.locator('#stage iframe').count(),0);
      assert.equal(await page.getByRole('tab',{name:'3D tour'}).count(),1);
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
      if(process.env.HAMPTON_E2E_BROWSER==='webkit' && width===1280){
        const before=await page.evaluate(()=>innerWidth);
        try {
          execFileSync('python3',['tests/e2e-x11-zoom.py','in']);
          await page.waitForFunction(w=>innerWidth<=w/2,before);
          const load=page.getByRole('button',{name:'Load Vimeo video'});
          await load.scrollIntoViewIfNeeded();
          await load.evaluate(el=>el.scrollIntoView({block:'center',inline:'nearest'}));
          await load.focus();
          try {await page.waitForFunction(()=>{
            const el=document.querySelector('#stage .tour-gate-button');if(!el)return false;
            const r=el.getBoundingClientRect(),hit=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);
            return document.activeElement===el && (hit===el||el.contains(hit));
          },null,{timeout:5000});} catch (error) {
            const position=await load.evaluate(el=>{const r=el.getBoundingClientRect();return {top:r.top,bottom:r.bottom,
              viewport:innerHeight,focused:document.activeElement===el,hit:document.elementFromPoint(r.left+r.width/2,r.top+r.height/2)?.tagName};});
            throw new Error(`Video load control is obscured at native zoom: ${JSON.stringify(position)}`,{cause:error});
          }
          assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'public page reflows at native zoom 200%');
        } finally {execFileSync('python3',['tests/e2e-x11-zoom.py','reset']);}
      }
      assert.deepEqual(errors,[]);if(resizeWarnings)console.log(`Known WebKit ResizeObserver notices: ${resizeWarnings}`);await ctx.close();
    }
  } finally {await browser.close();}
  console.log('PUB-08 public video and tags 1280/390: PASS');
})().catch(error=>{console.error(error);process.exitCode=1;});
