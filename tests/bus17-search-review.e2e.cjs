// Isolated local fixtures only: E2E_PRODUCTION_READONLY=0 E2E_SCRIPT=tests/bus17-search-review.e2e.cjs npm run test:e2e:isolated
// BUS-17: an active search with no complete option for 21 days gets one internal Inbox review; its alternatives, closest
// first and each explained, are in the search's Matches tab; Done closes it and nothing is sent. The fixture has no
// clock Worker, so the clock's pass (searchReviewPass) runs here, on the same local D1, through Wrangler's platform proxy.
const assert=require('node:assert/strict');
const {readFileSync,mkdirSync}=require('node:fs');
const {join,dirname}=require('node:path');
const {parseEnv}=require('node:util');
const {execFileSync}=require('node:child_process');
const {chromium,webkit}=require(process.env.PW||'playwright-core');
(async()=>{
 assert.equal(process.env.HAMPTON_E2E_ISOLATED,'1');assert.equal(process.env.E2E_PRODUCTION_READONLY,'0');
 const vars=parseEnv(readFileSync(process.env.E2E_VARS,'utf8')),{signSession,COOKIE}=await import('../server/auth.js');
 const {searchReviewPass}=await import('../server/search-review.js');
 const {getPlatformProxy}=await import('wrangler');
 const proxy=await getPlatformProxy({configPath:'wrangler.toml',persist:{path:join(process.env.E2E_PERSIST,'v3')}});
 const clock={...proxy.env,BUS17_REVIEW_READY:'1',EST01_SEARCH_STATE_READY:'1',EST16_AVAILABILITY_READY:'1',EST15_UNAVAILABILITY_READY:'1'};
 // The local D1 file is shared with the website's dev server: a tick that meets its lock is tried again, as the next tick would.
 const pass=async()=>{for(let i=0;;i++)try{return await searchReviewPass(clock,new Date().toISOString());}
  catch(e){if(i>=5||!/SQLITE_BUSY|commit token/.test(String(e?.stack)))throw e;await new Promise(r=>setTimeout(r,500));}};
 const base=process.env.BASE.replace('127.0.0.1','localhost'),origin=new URL(base).origin,ADMIN='admin@example.test';
 const shots=process.env.E2E_SHOTS;if(shots)mkdirSync(shots,{recursive:true});
 const wrangler=join(dirname(require.resolve('wrangler')),'..','bin','wrangler.js');
 const d1=sql=>JSON.parse(execFileSync(process.execPath,[wrangler,'d1','execute','hampton','--local','--persist-to',process.env.E2E_PERSIST,
  '--json','--command',sql],{encoding:'utf8',stdio:['ignore','pipe','pipe']})).at(-1).results;
 const value=v=>v==null?'NULL':typeof v==='number'?String(v):`'${String(v).replaceAll("'","''")}'`;
 const browser=await (process.env.HAMPTON_E2E_BROWSER==='webkit'?webkit:chromium).launch({executablePath:process.env.CHROME});
 try{
  const ctx=await browser.newContext();
  await ctx.addCookies([{name:COOKIE,value:await signSession(ADMIN,vars.SESSION_SECRET),domain:new URL(base).hostname,path:'/',httpOnly:true,secure:true,sameSite:'Strict'}]);
  await ctx.route('https://fonts.googleapis.com/**',route=>route.fulfill({status:200,contentType:'text/css',body:''}));
  const errors=[];
  for(const width of [1280,390]){
   console.log('BUS17 width',width);
   const lid=i=>`HE-T${width}${i}`,home=i=>`BUS17 ${width} home ${i}`,name=`BUS17 Ana ${width}`;
   d1("UPDATE listings SET matchable=0;"+[[1,1800],[2,2500]].map(([i,rent])=>{
    const row={id:lid(i),title:home(i),use:'residential',operation:'rent',availability:'to_let',matchable:1,rent,rent_period:'month',currency:'GBP',
     country:'Jersey',location:'St Helier',parish:'St Helier',bedrooms:2,bathrooms:1,housing_category:'registered',published:0,
     created_at:'2026-11-09T10:00:00.000Z',updated_at:'2026-11-09T10:00:00.000Z',updated_by:'fixture'};
    return `INSERT INTO listings(${Object.keys(row)}) VALUES(${Object.values(row).map(value)});`;
   }).join(''));
   const post=async(path,data,expected=200,method='post')=>{const r=await ctx.request[method](base+'api'+path,{headers:{origin},data});
    assert.equal(r.status(),expected,await r.text());return r.json();};
   const ana=(await post('/admin/applicants',{name,email:`bus17-ana-${width}@example.test`,operation:'rent',source:'phone',budget_max:2000,
    bedrooms_min:2,pets:[{kind:'none'}],household_adults:2,household_children:0,
    requirement_priorities:{version:1,values:{budget:'must',bedrooms:'must'},unknown:[]}},201)).id;
   const reviews=()=>d1(`SELECT cycle,closed_at IS NULL AS open,outcome FROM search_reviews WHERE applicant_id=${ana}`);
   const tasks=()=>d1(`SELECT id,title,resolved_at IS NOT NULL AS done FROM notifications WHERE task_key LIKE 'bus17:review:%'
    AND event_id IN (SELECT id FROM events WHERE entity_type='applicant' AND entity_id='${ana}')`);
   // Registered just now: nothing is due.
   await pass();
   assert.deepEqual(reviews(),[],'nothing before day 21');
   // A fixture's shortcut: the search was registered 22 days ago, after the clock was switched on. Two ticks, one review.
   const ago=new Date(Date.now()-22*864e5).toISOString();
   d1(`UPDATE search_review_progress SET enabled_at='2026-01-01T00:00:00.000Z',after_id=0;UPDATE applicants SET created_at='${ago}' WHERE id=${ana};
    DELETE FROM search_review_cycles WHERE applicant_id=${ana};`);
   for(let tick=0;tick<2;tick++)await pass();
   assert.deepEqual(reviews(),[{cycle:1,open:1,outcome:null}]);
   assert.deepEqual(tasks().map(t=>[t.title,t.done]),[[`21-day search review for ${name}`,0]]);

   const page=await ctx.newPage();page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
   page.setDefaultTimeout(15000);
   await page.setViewportSize({width,height:900});
   const fits=async where=>assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth+1),`no sideways scroll: ${where} at ${width}`);
   const shot=async name=>{if(shots)await page.screenshot({path:join(shots,`bus17-${name}-${width}.png`),fullPage:true});};
   const text=async where=>(await where.innerText()).replace(/\s+/g,' ').trim();

   // The Inbox has the review; it leads to the search's Matches, where the alternatives are explained.
   await page.goto(base+'admin/#/');
   const task=page.locator('.inbox-list li').filter({hasText:`21-day search review for ${name}`}).first();
   await task.waitFor();
   await task.getByRole('button').click();
   const notice=page.locator('article.inbox-detail');
   await notice.getByRole('heading',{name:`21-day search review for ${name}`}).waitFor();
   await notice.getByText(/2 alternatives are listed in Matches/).waitFor();
   await fits('Inbox');await shot('inbox');
   await notice.getByRole('link',{name:'Open applicant'}).click();
   await page.waitForURL(url=>url.hash===`#/applicants/${ana}/matches`);
   const card=page.getByRole('region',{name:'21-day search review'});
   await card.waitFor();
   const items=card.getByRole('listitem');
   assert.equal(await items.count(),2);
   const first=await text(items.nth(0)),second=await text(items.nth(1));
   assert.ok(first.startsWith(home(1))&&first.includes('To confirm: Availability: Not confirmed by a person'),first);
   assert.ok(second.startsWith(home(2))&&second.includes('Does not meet: Budget (must-have): £2,500 a month, over £2,000'),second);
   assert.match(await text(card),/Nothing has been sent and the criteria have not changed\./);
   await card.scrollIntoViewIfNeeded();
   await fits('review');await shot('review');

   // Done in the Inbox closes the review on the next tick; the card goes and no second task opens.
   await page.goto(base+'admin/#/');
   await page.locator('.inbox-list li').filter({hasText:`21-day search review for ${name}`}).first().getByRole('button').click();
   await page.locator('article.inbox-detail').getByRole('button',{name:'Done'}).click();
   for(let i=0;i<80&&!tasks()[0].done;i++)await page.waitForTimeout(100);
   assert.equal(tasks()[0].done,1);
   await pass();
   assert.deepEqual(reviews(),[{cycle:1,open:0,outcome:'reviewed'}]);
   await page.goto(base+`admin/#/applicants/${ana}/matches`);
   await page.locator('#panel-matches').waitFor();
   await page.getByRole('heading',{name:'Widen criteria'}).waitFor(); // the page has loaded its search
   assert.equal(await page.getByRole('region',{name:'21-day search review'}).count(),0);
   assert.equal(tasks().length,1);
   assert.deepEqual(d1(`SELECT status FROM matches WHERE applicant_id=${ana} ORDER BY listing_id`),[{status:'found'},{status:'found'}]);
   assert.deepEqual(d1('SELECT COUNT(*) AS n FROM outbound'),[{n:0}],'nothing is sent');
   await page.close();
  }
  assert.deepEqual(errors,[]);
  console.log('BUS-17 E2E passed: 1280/390, nothing before day 21, one review and one Inbox task over two ticks, the Inbox leads to Matches with two explained alternatives (availability to confirm, budget must-have unmet), Done closes the review and its card, matches unchanged, nothing sent.');
 }finally{await browser.close();await proxy.dispose();}
})().catch(e=>{console.error(e);process.exitCode=1;});
