// Local synthetic fixtures only; run via test:e2e:isolated.
const {chromium}=require(process.env.PW||'playwright-core');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {execFileSync}=require('node:child_process');
const BASE=process.env.BASE||'http://localhost:8788/';
const photo=fs.readFileSync('tests/fixtures/photo.jpg');
const listing=(i,status,viewingsEnabled=true)=>({viewingsEnabled,id:`HE-R00${i}`,title:`Fixture home ${i}`,region:'jersey',place:'St Saviour',
  operation:'sale',use:'residential',status,beds:2,baths:1,type:'Flat',salePrice:500000,currency:'GBP',
  image:'/media/PUB16',thumb:'/media/PUB16',photos:[{src:'/media/PUB16',thumb:'/media/PUB16',alt:'Fixture room'}],
  summary:[],description:[],specs:[],floorplans:[],featured:i});
const fixtures=[listing(1,'Sold'),listing(2,'Let agreed'),listing(3,'Let'),listing(4,'Under Offer'),listing(5,'Withdrawn')];

(async()=>{
  const browser=await chromium.launch(process.env.CHROME?{executablePath:process.env.CHROME}:{});
  try {
    for (const width of [1280,390]) {
      const context=await browser.newContext({viewport:{width,height:844},reducedMotion:'reduce'});
      const page=await context.newPage();
      const errors=[]; page.on('pageerror',error=>errors.push(error.message));
      let visibleFixtures=fixtures;
      await page.route('**/api/listings',route=>route.fulfill({json:visibleFixtures}));
      await page.route('**/media/PUB16*',route=>route.fulfill({body:photo,contentType:'image/jpeg'}));
      await page.route(/challenges\.cloudflare\.com/,route=>route.abort());
      await page.goto(BASE);
      await page.waitForSelector('.hero .slide');
      for (const id of ['HE-R001','HE-R002','HE-R003','HE-R005']) {
        const slide=page.locator(`.slide[data-id="${id}"]`);
        assert.equal(await slide.locator('[data-book]').count(),0,id);
        assert.equal(await slide.getByRole('link',{name:'Contact us'}).count(),1,id);
      }
      assert.equal(await page.locator('.slide[data-id="HE-R004"] [data-book]').count(),1);
      for (const id of ['HE-R001','HE-R002','HE-R003','HE-R005']) {
        await page.goto(BASE+'p/'+id);
        await page.waitForSelector('.summary');
        assert.equal(await page.locator('#detail-book').count(),0,id);
        const contact=page.locator('.summary').getByRole('link',{name:'Contact us'});
        assert.equal(await contact.count(),1,id);
        assert.equal(await contact.getAttribute('href'),'/#team');
        await contact.focus();
        assert.equal(await contact.evaluate(node=>node===document.activeElement),true,id);
        await page.keyboard.press('Enter');
        await page.waitForURL('**/#team');
        assert.equal(await page.evaluate(()=>document.activeElement?.id),'team',id);
      }
      visibleFixtures=[listing(6,'For Sale',false)];
      await page.goto(BASE);
      await page.waitForSelector('.hero .slide');
      assert.equal(await page.locator('.hero [data-book]').count(),0,'viewings disabled hero');
      assert.equal(await page.locator('.hero').getByRole('link',{name:'Contact us'}).count(),1);
      await page.goto(BASE+'p/HE-R006');
      await page.waitForSelector('.summary');
      assert.equal(await page.locator('#detail-book').count(),0,'viewings disabled detail');
      assert.equal(await page.locator('.summary').getByRole('link',{name:'Contact us'}).count(),1);
      // A cached card may still show a listing that closed after slots loaded.
      let sent=false;
      visibleFixtures=[listing(4,'Under Offer')];
      await page.route('**/api/config',route=>route.fulfill({json:{turnstileSiteKey:'fixture',chat:false}}));
      await page.route('**/api/availability?*',route=>sent
        ? route.fulfill({status:404,json:{error:'Unknown property'}})
        : route.fulfill({json:{negotiators:[{id:1,name:'Fixture Agent'}],days:[{date:'2026-11-14',slots:{1:[{time:'10:00',booked:false}]}}]}}));
      await page.route('**/api/viewings',route=>{sent=true;return route.fulfill({status:400,json:{fields:{listing_id:'That property is no longer available. Choose another or send a general enquiry.'}}});});
      await page.goto(BASE+'p/HE-R004');
      const form=page.locator('#detail-slot form');
      await form.locator('input[name=time]').first().waitFor();
      await form.locator('input[name=name]').fill('Test Visitor');
      await form.locator('input[name=email]').fill('visitor@example.test');
      await form.evaluate(node=>{const field=document.createElement('input');field.type='hidden';field.name='cf-turnstile-response';field.value='fixture';node.append(field);});
      await form.locator('button[type=submit]').click();
      await page.waitForFunction(()=>document.querySelector('#detail-slot .form-status')?.textContent.includes('no longer available'),null,{timeout:5000});
      assert.equal(await form.locator('input[name=time]').count(),0);
      assert.ok(await form.locator('button[type=submit]').isDisabled());
      assert.equal(await form.locator('input[name=name]').inputValue(),'Test Visitor');
      assert.equal(sent,true);
      if (process.env.HAMPTON_E2E_BROWSER==='webkit' && width===1280) {
        const before=await page.evaluate(()=>innerWidth);
        execFileSync('python3',['tests/e2e-x11-zoom.py','in']);
        await page.waitForFunction(w=>innerWidth<=w/2,before);
        assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'native 200% zoom reflows');
        execFileSync('python3',['tests/e2e-x11-zoom.py','reset']);
        await page.waitForFunction(w=>innerWidth===w,before);
      }
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
      assert.deepEqual(errors,[]);
      await context.close();
    }
  } finally { await browser.close(); }
  console.log('PUB-16 state UI 1280/390: closed listings show contact, not booking. PASS');
})().catch(error=>{console.error(error);process.exitCode=1;});
