// Isolated local fixtures only: E2E_PRODUCTION_READONLY=0 E2E_SCRIPT=tests/bus15-review.e2e.cjs npm run test:e2e:isolated
const assert=require('node:assert/strict');
const {readFileSync,mkdirSync}=require('node:fs');
const {join,dirname}=require('node:path');
const {parseEnv}=require('node:util');
const {execFileSync}=require('node:child_process');
const {chromium,webkit}=require(process.env.PW||'playwright-core');
(async()=>{
 assert.equal(process.env.HAMPTON_E2E_ISOLATED,'1');assert.equal(process.env.E2E_PRODUCTION_READONLY,'0');
 const vars=parseEnv(readFileSync(process.env.E2E_VARS,'utf8')),{signSession,COOKIE}=await import('../server/auth.js');
 const base=process.env.BASE.replace('127.0.0.1','localhost'),origin=new URL(base).origin,ADMIN='admin@example.test';
 const shots=process.env.E2E_SHOTS;if(shots)mkdirSync(shots,{recursive:true});
 const wrangler=join(dirname(require.resolve('wrangler')),'..','bin','wrangler.js');
 const d1=sql=>JSON.parse(execFileSync(process.execPath,[wrangler,'d1','execute','hampton','--local','--persist-to',process.env.E2E_PERSIST,
  '--json','--command',sql],{encoding:'utf8',stdio:['ignore','pipe','pipe']})).at(-1).results;
 const browser=await (process.env.HAMPTON_E2E_BROWSER==='webkit'?webkit:chromium).launch({executablePath:process.env.CHROME});
 try{
  const ctx=await browser.newContext();
  await ctx.addCookies([{name:COOKIE,value:await signSession(ADMIN,vars.SESSION_SECRET),domain:new URL(base).hostname,path:'/',httpOnly:true,secure:true,sameSite:'Strict'}]);
  const errors=[];
  for(const width of [1280,390]){
   console.log('BUS15 width',width);
   // Ana (the older search) is proposed four homes; Ben is proposed the second one too.
   const ids=[];
   for(const name of ['Ana','Ben']){
    const made=await ctx.request.post(base+'api/admin/applicants',{headers:{origin},data:{name:`BUS15 ${name} ${width}`,email:`bus15-${name}-${width}@example.test`,operation:'buy',source:'phone',budget_max:1000000}});
    assert.equal(made.status(),201);ids.push((await made.json()).id);
   }
   const [ana,ben]=ids,home=i=>`BUS15 ${width} home ${i}`,lid=i=>`BUS15-${width}-${i}`,sql=["UPDATE listings SET matchable=0 WHERE id NOT LIKE 'BUS15-%';DELETE FROM matches;"];
   for(let i=1;i<=4;i++){
    sql.push(`INSERT INTO listings(id,title,use,operation,availability,matchable,sale_price,currency,published,created_at,updated_at,updated_by) VALUES('${lid(i)}','${home(i)}','residential','sale','for_sale',1,900000,'GBP',0,'2026-11-09T10:00:00.000Z','2026-11-09T10:00:00.000Z','fixture');`);
    sql.push(`INSERT INTO matches(applicant_id,listing_id,score,checks,requirements_rank,status,created_at,updated_at) VALUES(${ana},'${lid(i)}',${100-i*10},'[]',1,'found','2026-11-10T10:00:00.000Z','2026-11-10T10:00:00.000Z');`);
   }
   sql.push(`INSERT INTO matches(applicant_id,listing_id,score,checks,requirements_rank,status,created_at,updated_at) VALUES(${ben},'${lid(2)}',85,'[]',1,'found','2026-11-10T10:00:00.000Z','2026-11-10T10:00:00.000Z');`);
   sql.push(`UPDATE applicants SET match_ranking_version=1 WHERE id IN (${ana},${ben});`);
   d1(sql.join(''));
   const page=await ctx.newPage();page.on('pageerror',e=>errors.push(e.message));
   await page.setViewportSize({width,height:900});
   const fits=async where=>assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth+1),`no sideways scroll: ${where} at ${width}`);

   // The queue, by keyboard only: what approving covers, the dates, then A, R + 2, S, S.
   await page.goto(base+'admin/#/review');
   const card=page.locator('.review .match'),said=text=>page.locator('.review-msg').filter({hasText:text}).waitFor();
   await card.getByRole('link',{name:home(1),exact:true}).waitFor();
   await page.getByText(/^Shortlisting approves a first availability enquiry about the property, nothing else/).waitFor();
   await card.getByText(/^Found 10 Nov 2026.* · Property updated 9 Nov 2026/).waitFor();
   await fits('Review');
   if(shots)await page.screenshot({path:join(shots,`bus15-review-${width}.png`),fullPage:true});
   await page.waitForFunction(()=>document.activeElement?.id?.startsWith('match-'));
   await page.keyboard.press('a');await said('Shortlisted. 4 left.');
   await card.getByRole('link',{name:home(2),exact:true}).waitFor();
   await page.waitForFunction(()=>document.activeElement?.id?.startsWith('match-'));
   await page.keyboard.press('r');await card.getByRole('group',{name:`Why reject ${home(2)}?`}).waitFor();
   await page.keyboard.press('2');await said('Rejected · Area. 3 left.');
   await card.getByRole('link',{name:home(3),exact:true}).waitFor();
   await page.waitForFunction(()=>document.activeElement?.id?.startsWith('match-'));
   await page.keyboard.press('s');await card.getByRole('link',{name:home(4),exact:true}).waitFor();
   await page.waitForFunction(()=>document.activeElement?.id?.startsWith('match-'));
   await page.keyboard.press('s');
   // Ana rejected the second home; it is still proposed to Ben and still on offer.
   await page.locator('.review-who').getByRole('link',{name:`BUS15 Ben ${width}`,exact:true}).waitFor();
   await card.getByRole('link',{name:home(2),exact:true}).waitFor();
   assert.deepEqual(d1(`SELECT availability,archived_at,matchable FROM listings WHERE id='${lid(2)}'`),[{availability:'for_sale',archived_at:null,matchable:1}]);

   // Ana's Matches tab: who decided and when, then two ticked matches shortlisted with one action.
   await page.goto(base+`admin/#/applicants/${ana}/matches`);
   const group=status=>page.locator('.match-group').filter({has:page.locator(`#group-${status}`)});
   await group('shortlisted').getByText(`Shortlisted by ${ADMIN} · `).waitFor();
   await group('rejected').getByText(`Rejected · Area by ${ADMIN} · `).waitFor();
   const batch=n=>group('found').getByRole('button',{name:`Shortlist selected (${n})`,exact:true});
   await batch(0).waitFor();assert.equal(await batch(0).isDisabled(),true,'nothing is approved without a selection');
   for(const i of [3,4]){await group('found').getByRole('checkbox',{name:`Select ${home(i)}`,exact:true}).focus();await page.keyboard.press('Space');}
   await fits('Matches');
   if(shots)await page.screenshot({path:join(shots,`bus15-matches-${width}.png`),fullPage:true});
   // A colleague changes the search between the two saves: the first stays approved, the second is not forced.
   let puts=0;
   await page.route('**/api/admin/matches/*',route=>route.request().method()==='PUT'&&++puts===2
    ?route.fulfill({status:409,json:{error:'The search changed. Reload to see it.'}}):route.continue());
   await batch(2).focus();await page.keyboard.press('Enter');
   await page.getByRole('alert').filter({hasText:'Shortlisted 1 of 2. The search changed. Reload to see it.'}).waitFor();
   await page.unroute('**/api/admin/matches/*');
   await batch(0).waitFor();assert.equal(await group('found').locator('.match').count(),1);
   assert.equal(await group('found').getByRole('checkbox',{name:`Select ${home(4)}`,exact:true}).isChecked(),false,'the selection never carries over');
   await group('found').getByRole('checkbox',{name:`Select ${home(4)}`,exact:true}).focus();await page.keyboard.press('Space');
   await batch(1).focus();await page.keyboard.press('Enter');
   await page.getByText('Shortlisted 1 match.',{exact:true}).waitFor();
   await page.waitForFunction(()=>document.activeElement?.id==='group-found');
   assert.equal(await group('shortlisted').locator('.match').count(),3);
   assert.equal(await group('found').locator('.match').count(),0);
   // Every approval is one person's recorded decision, with the versions reviewed.
   assert.deepEqual(d1(`SELECT COUNT(*) AS n FROM events WHERE type='match.reviewed' AND entity_id='${ana}' AND actor='${ADMIN}'
    AND json_extract(data,'$.to')='shortlisted' AND json_extract(data,'$.search_version') IS NOT NULL AND json_extract(data,'$.listing_version') IS NOT NULL`),[{n:3}]);
   assert.deepEqual(d1(`SELECT status FROM matches WHERE applicant_id=${ben}`),[{status:'found'}]);
   await page.close();
  }
  assert.deepEqual(errors,[]);
  console.log('BUS-15 E2E passed: 1280/390, keyboard queue, approval scope, dates and reviewer, explicit batch shortlist and its partial failure, rejection leaves the property to others.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
