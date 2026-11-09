// Isolated local fixtures only: E2E_SCRIPT=tests/bus14-e2e.cjs npm run test:e2e (PW/CHROME as tests/e2e.cjs).
const assert=require('node:assert/strict');
const {readFileSync,mkdirSync}=require('node:fs');
const {parseEnv}=require('node:util');
const {execFileSync}=require('node:child_process');
const {chromium}=require(process.env.PW||'playwright-core');
(async()=>{
 const vars=parseEnv(readFileSync(process.env.E2E_VARS,'utf8')),{signSession,COOKIE}=await import('../server/auth.js');
 const base=process.env.BASE.replace('127.0.0.1','localhost'),shots='/tmp/bus14-captures';mkdirSync(shots,{recursive:true});
 const browser=await chromium.launch({executablePath:process.env.CHROME});
 try{
  const ctx=await browser.newContext();await ctx.addCookies([{name:COOKIE,value:await signSession('admin@example.test',vars.SESSION_SECRET),domain:new URL(base).hostname,path:"/",httpOnly:true,secure:true,sameSite:'Strict'}]);
  const made=await ctx.request.post(base+'api/admin/applicants',{headers:{origin:new URL(base).origin},data:{name:'BUS14 fixture',email:'bus14@example.test',operation:'buy',source:'phone',budget_max:1000000}});
  assert.equal(made.status(),201);const {id}=await made.json();
  const sql=[];
  for(let i=0;i<60;i++){const lid=`BUS14-${String(i).padStart(3,'0')}`;
   sql.push(`INSERT INTO listings(id,title,use,operation,availability,matchable,sale_price,published,created_at,updated_at,updated_by) VALUES('${lid}','BUS14 home ${i}','residential','sale','for_sale',1,900000,0,'2026-11-09','2026-11-09','fixture');`);
   sql.push(`INSERT INTO matches(applicant_id,listing_id,score,checks,requirements_rank,status,created_at,updated_at) VALUES(${id},'${lid}',90,'[]',1,'found','2026-11-09','2026-11-09');`);
  }
  sql.push(`DELETE FROM matches WHERE applicant_id=${id} AND listing_id NOT LIKE 'BUS14-%'; UPDATE listings SET matchable=0 WHERE id NOT LIKE 'BUS14-%'; UPDATE applicants SET match_ranking_version=1 WHERE id=${id};`);
  const wrangler=require('node:path').join(require('node:path').dirname(require.resolve('wrangler')),'..','bin','wrangler.js');
  execFileSync(process.execPath,[wrangler,'d1','execute','hampton','--local','--persist-to',process.env.E2E_PERSIST,'--command',sql.join('')],{stdio:'pipe'});
  let page;const errors=[];
  for(const width of [1280,390]){
   console.log('BUS14 width',width);
   const editedBudget=String(1000000+width*100);
   page=await ctx.newPage();page.on('pageerror',e=>errors.push(e.message));
   await page.setViewportSize({width,height:900});await page.goto(base+`admin/#/applicants/${id}/matches`);
   const found=page.locator('.match-group').filter({has:page.locator('#group-found')});
   await page.getByRole('button',{name:'Next Found page',exact:true}).waitFor();
   await found.locator('.match').first().waitFor();assert.equal(await found.locator('.match').count(),25);
   await page.getByRole('button',{name:'Next Found page',exact:true}).click();await found.getByRole('link',{name:'BUS14 home 25',exact:true}).waitFor();
   assert.equal(await found.locator('.match').count(),25);
   await page.getByRole('button',{name:'Next Found page',exact:true}).click();await found.getByRole('link',{name:'BUS14 home 50',exact:true}).waitFor();assert.equal(await found.locator('.match').count(),10);
   await page.getByRole('button',{name:'Previous Found page',exact:true}).click();await found.getByRole('link',{name:'BUS14 home 25',exact:true}).waitFor();
   await page.locator('#tab-requirements').click();await page.locator('#a-budget_max').fill(editedBudget);await page.locator('#tab-matches').click();
   await found.getByRole('button',{name:'Shortlist BUS14 home 25',exact:true}).click();await page.getByText('Shortlisted BUS14 home 25.',{exact:true}).waitFor();
   await page.locator('#tab-requirements').click();assert.equal(await page.locator('#a-budget_max').inputValue(),editedBudget);
   await page.locator('#tab-timeline').click();await page.getByText('Shortlisted BUS14 home 25',{exact:true}).first().waitFor();
   await page.locator('#tab-matches').click();const shortlisted=page.locator('.match-group').filter({has:page.locator('#group-shortlisted')});
   await shortlisted.getByRole('button',{name:/Undo.*BUS14 home 25.*Found/}).click();await page.getByText('BUS14 home 25 is back in Found.',{exact:true}).waitFor();
   await page.getByRole('button',{name:'Next Found page',exact:true}).click();
   await found.getByRole('link',{name:'BUS14 home 25',exact:true}).waitFor();
   await page.waitForFunction(()=>document.activeElement.id==='group-found');
   let injected=false;
   await page.route('**/api/admin/applicants/*/matches?status=found*',async route=>{
    if(route.request().url().includes('&after=')&&!injected){injected=true;await route.fulfill({status:409,contentType:'application/json',body:JSON.stringify({error:'Matches changed. Start again.'})});}
    else await route.continue();
   });
   await page.getByRole('button',{name:'Next Found page',exact:true}).click();
   await page.getByText('Matches changed. Showing the first page with the current results.',{exact:true}).waitFor();
   await found.getByRole('link',{name:'BUS14 home 0',exact:true}).waitFor();
   await page.unroute('**/api/admin/applicants/*/matches?status=found*');
   let failed=false;
   await page.route('**/api/admin/applicants/*/matches?status=found*',async route=>{
    if(route.request().url().includes('&after=')&&!failed){failed=true;await route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'Fixture temporarily unavailable'})});}
    else await route.continue();
   });
   await page.getByRole('button',{name:'Next Found page',exact:true}).click();
   await found.getByRole('button',{name:'Retry Found',exact:true}).click();
   await found.getByRole('link',{name:'BUS14 home 25',exact:true}).waitFor();
   await page.unroute('**/api/admin/applicants/*/matches?status=found*');
   await found.getByRole('button',{name:'Reject BUS14 home 25',exact:true}).click();
   await found.locator('.reasons').getByRole('button',{name:'Price',exact:true}).click();
   const rejected=page.locator('.match-group').filter({has:page.locator('#group-rejected')});
   await rejected.getByText('Historical score 90',{exact:true}).waitFor();
   await rejected.getByRole('button',{name:/Undo.*BUS14 home 25.*Found/}).click();
   await shortlisted.getByText('Nothing shortlisted yet.',{exact:true}).waitFor();
   await found.getByRole('link',{name:'BUS14 home 0',exact:true}).waitFor();
   // Hold an old page response, save different requirements, then release it. It must never replace the new first page.
   let release,arrive,finish;const held=new Promise(r=>release=r),arrived=new Promise(r=>arrive=r),finished=new Promise(r=>finish=r);let holding=false;
   await page.route('**/api/admin/applicants/*/matches?status=found*',async route=>{
    if(route.request().url().includes('&after=')&&!holding){holding=true;const response=await route.fetch();arrive();await held;await route.fulfill({response});finish();}
    else await route.continue();
   });
   try{
    await page.getByRole('button',{name:'Next Found page',exact:true}).click();await Promise.race([arrived,new Promise((_,reject)=>setTimeout(()=>reject(new Error("Next page request was not captured")),10000))]);
    await page.locator('#tab-requirements').click();await page.getByRole('button',{name:'Save',exact:true}).click();
    await page.getByText('Changes saved.',{exact:true}).waitFor();console.log('BUS14 saved',width);await page.locator('#tab-matches').click();
    await found.getByRole('link',{name:'BUS14 home 0',exact:true}).waitFor();
   }finally{release();await Promise.race([finished,new Promise((_,reject)=>setTimeout(()=>reject(new Error("Held route did not finish")),10000))]);}
   await page.unroute('**/api/admin/applicants/*/matches?status=found*');
   await page.waitForFunction(()=>document.querySelector('#group-found')?.parentElement.getAttribute('aria-busy')==='false');
   assert.equal(await found.getByRole('link',{name:'BUS14 home 25',exact:true}).count(),0);
   // A recovery detail response from before a newer save must not replace the saved record.
   let releaseDetail,detailArrived,detailFinished;
   const detailHeld=new Promise(r=>releaseDetail=r),gotDetail=new Promise(r=>detailArrived=r),deliveredDetail=new Promise(r=>detailFinished=r);
   let heldDetail=false,forcedConflict=false;
   await page.route(`**/api/admin/applicants/${id}`,async route=>{
    if(route.request().method()==='GET'&&!heldDetail){heldDetail=true;const response=await route.fetch();detailArrived();await detailHeld;await route.fulfill({response});detailFinished();}
    else await route.continue();
   });
   await page.route('**/api/admin/applicants/*/matches?status=found*',async route=>{
    if(route.request().url().includes('&after=')&&!forcedConflict){forcedConflict=true;await route.fulfill({status:409,contentType:'application/json',body:JSON.stringify({error:'Fixture revision changed'})});}
    else await route.continue();
   });
   try{
    await page.getByRole('button',{name:'Next Found page',exact:true}).click();
    await Promise.race([gotDetail,new Promise((_,reject)=>setTimeout(()=>reject(new Error('Recovery detail was not captured')),10000))]);
    await page.locator('#tab-requirements').click();await page.locator('#a-budget_max').fill(String(Number(editedBudget)+1000));
    await page.getByRole('button',{name:'Save',exact:true}).click();await page.getByText('Changes saved.',{exact:true}).waitFor();
   }finally{releaseDetail();await deliveredDetail;}
   await page.unroute(`**/api/admin/applicants/${id}`);await page.unroute('**/api/admin/applicants/*/matches?status=found*');
   await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
   await page.waitForTimeout(100);
   assert.equal(await page.locator('.unsaved').count(),0,'old recovery detail must not turn a saved form dirty');
   await page.locator('#tab-matches').click();await found.locator('.match').first().waitFor();
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
   await page.evaluate(()=>document.documentElement.style.zoom='200%');
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
   await page.evaluate(()=>document.documentElement.style.zoom='');
   execFileSync(process.execPath,[wrangler,'d1','execute','hampton','--local','--persist-to',process.env.E2E_PERSIST,'--command',`UPDATE applicants SET match_ranking_version=0 WHERE id=${id}`],{stdio:'pipe'});
   await page.reload();await page.getByRole('button',{name:'Recalculate matches',exact:true}).waitFor();
   await found.getByText('Previous score 90',{exact:true}).first().waitFor();
   await page.getByRole('button',{name:'Recalculate matches',exact:true}).click();
   await page.getByText('Matches recalculated.',{exact:true}).waitFor();
   await page.waitForFunction(()=>![...document.querySelectorAll('.match .score')].some(e=>e.textContent.includes('Previous score')));
   await page.locator("#group-found").scrollIntoViewIfNeeded();await page.screenshot({path:`${shots}/${width}-viewport.png`});await page.screenshot({path:`${shots}/${width}.png`,fullPage:true});await page.close();
  }
  // Widen must see an alternative beyond the first25 cards and improve it without adding another pair.
  const wsql=[];for(const [i,beds,price] of [[70,6,950000],[71,5,800000],[72,6,850000],[73,6,860000]])
   wsql.push(`INSERT INTO listings(id,title,use,operation,availability,matchable,sale_price,parish,bedrooms,published,created_at,updated_at,updated_by)
    VALUES('HE-R0${i}','Widen fixture ${i}','residential','sale','for_sale',1,${price},'Trinity',${beds},0,'2026-11-09','2026-11-09','fixture')`);
  execFileSync(process.execPath,[wrangler,'d1','execute','hampton','--local','--persist-to',process.env.E2E_PERSIST,'--command',wsql.join(';')],{stdio:'pipe'});
  const madeWiden=await ctx.request.post(base+'api/admin/applicants',{headers:{origin:new URL(base).origin},data:{name:'Widen fixture',email:'widen-bus14@example.test',source:'phone',operation:'buy',budget_max:900000,bedrooms_min:6,parishes_wanted:['Trinity'],
   requirement_priorities:{version:1,values:{budget:'must',bedrooms:'must',area:'must'},unknown:[]}}});
  assert.equal(madeWiden.status(),201);const wid=(await madeWiden.json()).id;
  for(const width of [1280,390]){
   page=await ctx.newPage();page.on('pageerror',e=>errors.push(e.message));await page.setViewportSize({width,height:900});
   await page.goto(base+`admin/#/applicants/${wid}/matches`);
   const widen=page.locator('section.widen'),row=widen.locator('li',{hasText:'Budget up 10%'});
   if(width===390){await row.getByText('0 new, 1 already found',{exact:true}).waitFor();await page.close();continue;}
   await row.getByText('0 new, 1 already found',{exact:true}).waitFor();
   assert.equal(await page.locator('.match').getByRole('link',{name:'Widen fixture 70',exact:true}).count(),0);
   await row.getByRole('button',{name:/Use this/}).click();assert.equal(await page.locator('#a-budget_max').inputValue(),'990000');
   await page.getByRole('button',{name:'Save',exact:true}).click();await page.getByText('Changes saved.',{exact:true}).waitFor();
   await page.locator('#tab-matches').click();assert.equal(await widen.count(),0);
   // Restore just this fixture's budget for the second width; it is an explicit staff save.
   const detail=await ctx.request.get(base+`api/admin/applicants/${wid}`),a=(await detail.json()).applicant;
   const reset=await ctx.request.put(base+`api/admin/applicants/${wid}`,{headers:{origin:new URL(base).origin},data:{budget_max:900000,updated_at:a.updated_at}});assert.equal(reset.status(),200);
   await page.close();
  }
  assert.deepEqual(errors,[]);console.log('BUS-14 E2E passed: 1280/390, pages, shortlist/Undo, Timeline and unsaved requirements.');
 }catch(e){const p=browser.contexts()[0]?.pages().at(-1);if(p){await p.screenshot({path:'/tmp/bus14-captures/failure.png',fullPage:true});console.error('Overflow elements:',await p.evaluate(()=>[...document.querySelectorAll('body *')].map(e=>({tag:e.tagName,className:e.className,right:Math.round(e.getBoundingClientRect().right),text:e.textContent.slice(0,45)})).filter(e=>e.right>innerWidth+1).slice(0,14)));await p.screenshot({path:'/tmp/bus14-captures/failure-viewport.png'});}throw e;}finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
