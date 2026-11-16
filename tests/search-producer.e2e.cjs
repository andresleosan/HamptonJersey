// Switch the producer on only through an intercepted /api/config (ANA04_SEARCH_STATS_READY stays off).
// Every measurement request is intercepted before it reaches the local server.
const {chromium}=require(process.env.PW || 'playwright-core');
const assert=require('node:assert/strict');
const BASE=process.env.BASE;
(async()=>{
  assert.ok(BASE && process.env.E2E_PERSIST,'isolated fixture required');
  const browser=await chromium.launch({executablePath:process.env.CHROME});
  try {
    const context=await browser.newContext({viewport:{width:1280,height:900}});
    const page=await context.newPage(), events=[], failures=[];
    page.on('pageerror',e=>failures.push(e.message));
    let reject=false;
    await page.route('**/api/search-stats',async route=>{
      const request=route.request();events.push({body:request.postDataJSON(),headers:request.headers()});
      if(reject) return route.abort();
      return route.fulfill({status:204,body:''});
    });
    await page.route('**/api/listings',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(
      Array.from({length:6},(_,i)=>({id:`HE-R00${i+1}`,title:`Fixture ${i+1}`,region:'jersey',operation:'rent',
        image:`/media/FIXTURE${i+1}`,use:'residential',beds:2,rent:2000,rentPeriod:'month',currency:'GBP',status:'available'})))}));
    await page.route('**/api/config',async route=>{
      const response=await route.fetch();const config=await response.json();
      assert.equal(config.searchStats,undefined,'the fixture runs with the switch off');
      return route.fulfill({response,json:{...config,searchStats:true}});
    });
    await page.goto(BASE);await page.locator('#quick').waitFor();
    await page.locator('#q-op').selectOption('rent');await page.locator('#q-beds').selectOption('2');await page.locator('#q-max').selectOption('2500');
    await Promise.all([page.waitForResponse(r=>r.url().endsWith('/api/search-stats')),page.locator('#quick button[type=submit]').click()]);
    assert.equal(events.length,1);assert.equal(events[0].body.zero_results,false);
    assert.deepEqual(Object.keys(events[0].body).sort(),['beds','event','max','op','region','version','zero_results']);
    assert.equal(events[0].headers.cookie,undefined);assert.equal(events[0].headers.referer,undefined);
    await page.locator('#c-beds').selectOption('2');await page.waitForTimeout(200);assert.equal(events.length,1);
    await page.goBack();await page.goForward();await page.locator('#c-max').waitFor();await page.waitForTimeout(200);assert.equal(events.length,1);
    await Promise.all([page.waitForResponse(r=>r.url().endsWith('/api/search-stats')),page.locator('#c-max').selectOption('1500')]);
    assert.equal(events.length,2);assert.equal(events[1].body.zero_results,true);
    assert.match(await page.locator('#count').innerText(),/^0 /);
    reject=true;
    await Promise.all([page.waitForRequest(r=>r.url().endsWith('/api/search-stats')),page.locator('#c-beds').selectOption('3')]);
    assert.match(await page.locator('#count').innerText(),/^0 /);assert.equal(events.length,3);
    await page.unroute('**/api/listings');
    await page.route('**/api/listings',route=>route.abort());
    await page.goto(BASE);await page.getByRole('alert').getByText("We couldn't load our properties right now.").waitFor();
    await page.waitForTimeout(200);assert.equal(events.length,3,'a failed catalogue is never reported as zero results');
    assert.deepEqual(failures,[]);await context.close();
    console.log('Synthetic producer: one per action, actual zero, unchanged selection, history, no referrer/cookie and failure isolation.');
  } finally {await browser.close();}
})().catch(e=>{console.error(e.message);process.exitCode=1;});
