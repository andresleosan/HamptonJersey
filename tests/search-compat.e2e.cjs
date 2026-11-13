// Exercise exact historical public assets and current assets only inside the networkless fixture.
const {chromium}=require(process.env.PW || 'playwright-core');
const {gunzipSync}=require('node:zlib');
const {readFileSync}=require('node:fs');
const {join}=require('node:path');
const assert=require('node:assert/strict');
const BASE=process.env.BASE;
const historical=name=>gunzipSync(readFileSync(join(__dirname,'fixtures/ana04-compat',name))).toString('utf8');
const legacyHtml=historical('legacy-index.html.gz'), legacyLib=historical('legacy-lib.js.gz');
const listings=Array.from({length:6},(_,i)=>({id:`HE-R00${i+1}`,title:`Fixture ${i+1}`,region:'jersey',operation:'rent',
  image:`/media/FIXTURE${i+1}`,use:'residential',beds:2,rent:2000,rentPeriod:'month',currency:'GBP',status:'available',
  description:[],summary:[],photos:[],specs:[]}));
(async()=>{
  assert.ok(BASE && process.env.E2E_PERSIST,'isolated fixture required');
  const browser=await chromium.launch({executablePath:process.env.CHROME});
  try {
    for(const variant of [
      {oldHtml:true,oldLib:false,missing:false},
      {oldHtml:false,oldLib:true,missing:false},
      {oldHtml:false,oldLib:false,missing:true},
      {oldHtml:false,oldLib:true,missing:true},
    ]) {
      const ctx=await browser.newContext({viewport:{width:1280,height:900}});
      const page=await ctx.newPage(), errors=[];let measurements=0;
      page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(8000);
      await page.route('**/*',async (route,request)=>{
        const url=new URL(request.url());
        if(url.origin!==new URL(BASE).origin)return route.fallback();
        if(request.isNavigationRequest() && url.pathname==='/') {
          if(variant.oldHtml) return route.fulfill({status:200,contentType:'text/html',body:legacyHtml});
          const response=await route.fetch();const html=await response.text();
          assert.ok(html.includes('const SEARCH_STATS_PRODUCER_ENABLED = false;'));
          // Only inside this intercepted synthetic document: prove compatibility guards suppress all tracking.
          return route.fulfill({response,body:html.replace('const SEARCH_STATS_PRODUCER_ENABLED = false;',
            'const SEARCH_STATS_PRODUCER_ENABLED = true;')});
        }
        if(url.pathname==='/lib.js' && variant.oldLib)
          return route.fulfill({status:200,contentType:'text/javascript',body:legacyLib});
        if(url.pathname==='/measurement-dimensions.js' && variant.missing)
          return route.fulfill({status:404,body:''});
        if(url.pathname==='/api/listings')
          return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(listings)});
        if(url.pathname==='/api/search-stats') {measurements++;return route.fulfill({status:204,body:''});}
        return route.fallback();
      });
      await page.goto(BASE);await page.locator('#quick').waitFor();
      await page.locator('#q-op').selectOption('rent');await page.locator('#q-beds').selectOption('2');
      await page.locator('#q-max').selectOption('2500');await page.locator('#quick button[type=submit]').click();
      await page.locator('#grid .card').first().waitFor();
      assert.equal(await page.locator('#grid .card').count(),6);
      assert.match(page.url(),/\/properties\?/);assert.match(page.url(),/max=2500/);
      await page.locator('#c-max').selectOption('1500');
      assert.match(await page.locator('#count').innerText(),/^0 /);
      await page.locator('#show-all').click();assert.equal(await page.locator('#grid .card').count(),6);
      await page.locator('#grid .card').first().click();await page.waitForURL('**/p/HE-R001');
      await page.goBack();await page.locator('#grid .card').first().waitFor();
      assert.deepEqual(errors,[]);assert.equal(measurements,0);
      await ctx.close();
      console.log('Synthetic compatibility variant passed.');
    }
  } finally {await browser.close();}
})().catch(e=>{console.error(e.message);process.exitCode=1;});
