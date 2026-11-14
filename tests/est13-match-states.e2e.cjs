// Isolated local fixtures only: E2E_PRODUCTION_READONLY=0 E2E_SCRIPT=tests/est13-match-states.e2e.cjs npm run test:e2e:isolated
const assert=require('node:assert/strict');
const {readFileSync,mkdirSync}=require('node:fs');
const {join,dirname}=require('node:path');
const {parseEnv}=require('node:util');
const {execFileSync}=require('node:child_process');
const {chromium,webkit}=require(process.env.PW||'playwright-core');
(async()=>{
 assert.equal(process.env.HAMPTON_E2E_ISOLATED,'1');assert.equal(process.env.E2E_PRODUCTION_READONLY,'0');
 const vars=parseEnv(readFileSync(process.env.E2E_VARS,'utf8')),{signSession,COOKIE}=await import('../server/auth.js');
 const {extractFeatures}=await import('../server/listing-features.js');
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
   console.log('EST13 width',width);
   // Two homes for sale: the first says it has parking for two cars, the second says nothing about parking.
   const home=i=>`EST13 ${width} home ${i}`,lid=i=>`EST13-${width}-${i}`;
   d1("UPDATE listings SET matchable=0;DELETE FROM matches;"+[['Parking for two cars'],['']].map(([description],i)=>{
    const row={id:lid(i+1),title:home(i+1),use:'residential',operation:'sale',availability:'for_sale',matchable:1,sale_price:900000,currency:'GBP',
     country:'Jersey',bedrooms:3,bathrooms:2,published:0,created_at:'2026-11-09T10:00:00.000Z',updated_at:'2026-11-09T10:00:00.000Z',
     updated_by:'fixture',...extractFeatures({description}),parish:'St Helier'};
    return `INSERT INTO listings(${Object.keys(row)}) VALUES(${Object.values(row).map(value)});`;
   }).join(''));
   // Ana and Ben both need two parking spaces and at most £1M; the engine proposes both homes to each.
   const ids=[];
   for(const name of ['Ana','Ben']){
    const made=await ctx.request.post(base+'api/admin/applicants',{headers:{origin},data:{name:`EST13 ${name} ${width}`,email:`est13-${name}-${width}@example.test`,
     operation:'buy',source:'phone',budget_max:1000000,parking_spaces:2,pets:[{kind:'none'}],
     requirement_priorities:{version:1,values:{budget:'must',parking:'must'},unknown:[]}}});
    assert.equal(made.status(),201,await made.text());ids.push((await made.json()).id);
   }
   const [ana,ben]=ids;
   assert.deepEqual(d1(`SELECT applicant_id,listing_id,status FROM matches ORDER BY applicant_id,listing_id`),
    [ana,ben].flatMap(a=>[1,2].map(i=>({applicant_id:a,listing_id:lid(i),status:'found'}))));
   const page=await ctx.newPage();page.on('pageerror',e=>errors.push(e.message));
   await page.setViewportSize({width,height:900});
   const fits=async where=>assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth+1),`no sideways scroll: ${where} at ${width}`);
   const group=status=>page.locator('.match-group').filter({has:page.locator(`#group-${status}`)});
   const card=(status,i)=>group(status).locator('article.match').filter({has:page.getByRole('link',{name:home(i),exact:true})});
   // One state of a card: the text of its row. Polled, because the lists reload after every action.
   const state=(where,label)=>where.locator('dl.match-states > div').filter({has:page.locator('dt',{hasText:label})}).locator('dd');
   const says=async(where,label,text)=>{
    for(let i=0;i<80&&!(await state(where,label).count()===1&&(await state(where,label).innerText()).replace(/\s+/g,' ').trim().startsWith(text));i++)await page.waitForTimeout(100);
    assert.ok((await state(where,label).innerText()).replace(/\s+/g,' ').trim().startsWith(text),`${label}: ${await state(where,label).innerText()} should start with ${text}`);
   };
   const settled=async(status,n)=>{
    for(let i=0;i<80&&!(await group(status).getAttribute('aria-busy')==='false'&&await group(status).locator('article.match').count()===n);i++)await page.waitForTimeout(100);
    assert.equal(await group(status).locator('article.match').count(),n,`${status} matches`);
   };
   const offered=()=>d1(`SELECT id,availability,archived_at,matchable FROM listings WHERE id LIKE 'EST13-${width}-%' ORDER BY id`);
   const listings=offered(),stage=()=>d1(`SELECT stage,search_state FROM applicants WHERE id=${ana}`);
   const before=stage();

   // Ana's Matches tab: four states on every card, each its own.
   await page.goto(base+`admin/#/applicants/${ana}/matches`);
   await settled('found',2);
   await says(card('found',1),'Evaluation','Stated must-haves met');
   await says(card('found',1),'Decision','Not decided');
   await says(card('found',1),'Availability','Not confirmed · Listed as For sale');
   await says(card('found',1),'Enquiry','Not sent');
   assert.equal(await card('found',1).getByRole('button',{name:/clarification/}).count(),0,'nothing to clarify where every must-have is answered');
   await says(card('found',2),'Evaluation','Requirements to confirm');
   await says(card('found',2),'Enquiry','Not sent · Parking to clarify: asking needs its own approval and shortlists nothing');
   await fits('Matches');

   // By keyboard: approve the clarification. The match stays undecided, in Found.
   await card('found',2).getByRole('button',{name:`Approve clarification for ${home(2)}`,exact:true}).focus();
   await page.keyboard.press('Enter');
   await page.getByText(`Clarification approved for ${home(2)}. It shortlists nothing and nothing has been sent.`,{exact:true}).waitFor();
   await settled('found',2);
   await says(card('found',2),'Enquiry',`Clarification approved · Parking by ${ADMIN} · `);
   await says(card('found',2),'Decision','Not decided');
   await says(card('found',2),'Evaluation','Requirements to confirm');
   await card('found',2).getByRole('button',{name:`Withdraw clarification for ${home(2)}`,exact:true}).waitFor();
   assert.deepEqual(d1(`SELECT status,reviewed_by FROM matches WHERE applicant_id=${ana} AND listing_id='${lid(2)}'`),[{status:'found',reviewed_by:null}]);
   assert.deepEqual(d1(`SELECT COUNT(*) AS n FROM events WHERE type='match.reviewed' AND entity_id='${ana}'`),[{n:0}]);

   // Shortlist the first home: only the decision moves.
   await card('found',1).getByRole('button',{name:`Shortlist ${home(1)}`,exact:true}).focus();
   await page.keyboard.press('Enter');
   await page.getByText(`Shortlisted ${home(1)}.`,{exact:true}).waitFor();
   await settled('shortlisted',1);await settled('found',1);
   await says(card('shortlisted',1),'Decision',`Shortlisted by ${ADMIN} · `);
   await says(card('shortlisted',1),'Availability','Not confirmed · Listed as For sale');
   await says(card('shortlisted',1),'Enquiry','Not sent');
   await card('shortlisted',1).getByRole('button',{name:/^Undo/}).waitFor();
   assert.deepEqual(offered(),listings,'approving touches no listing');
   assert.deepEqual(stage(),before,'nor the stage of the search');
   await says(card('found',2),'Enquiry','Clarification approved');
   if(shots)await page.screenshot({path:join(shots,`est13-states-${width}.png`),fullPage:true});

   // The Timeline names the clarification as its own event.
   await page.locator('#tab-timeline').click();
   await page.locator('#panel-timeline').getByText('Clarification approved',{exact:true}).waitFor();
   await page.locator('#tab-matches').click();

   // The price of the first home changes: still Shortlisted, but the approval says it is out of date.
   d1(`UPDATE listings SET sale_price=880000 WHERE id='${lid(1)}'`);
   await page.reload();
   await settled('shortlisted',1);
   await says(card('shortlisted',1),'Decision',`Approval out of date Shortlisted by ${ADMIN} · `);
   await card('shortlisted',1).getByText(/^This approval does not cover the search and the property as they are now/).waitFor();
   await says(card('found',2),'Enquiry','Clarification approved');
   await fits('outdated approval');
   if(shots)await page.screenshot({path:join(shots,`est13-outdated-${width}.png`),fullPage:true});
   // Review again: back to Found, decided anew on today's details.
   await card('shortlisted',1).getByRole('button',{name:new RegExp(`^Review again.*${home(1)}.*Found$`)}).focus();
   await page.keyboard.press('Enter');
   await page.getByText(`${home(1)} is back in Found.`,{exact:true}).waitFor();
   await settled('found',2);await settled('shortlisted',0);
   await says(card('found',1),'Decision','Not decided');
   await card('found',1).getByRole('button',{name:`Shortlist ${home(1)}`,exact:true}).focus();
   await page.keyboard.press('Enter');
   await page.getByText(`Shortlisted ${home(1)}.`,{exact:true}).waitFor();
   await settled('shortlisted',1);
   await says(card('shortlisted',1),'Decision',`Shortlisted by ${ADMIN} · `);

   // Ben shortlists the same home; then Ana's search is resolved. His matches and decisions stay as they were.
   const put=async(path,data,method='put')=>{const r=await ctx.request[method](base+'api'+path,{headers:{origin},data});assert.equal(r.status(),200,await r.text());};
   const bens=()=>d1(`SELECT listing_id,status,reviewed_by FROM matches WHERE applicant_id=${ben} ORDER BY listing_id`);
   await put(`/admin/matches/${d1(`SELECT id FROM matches WHERE applicant_id=${ben} AND listing_id='${lid(1)}'`)[0].id}`,{status:'shortlisted',from:'found'});
   const kept=bens();
   await put(`/admin/applicants/${ana}/search`,{state:'resolved',reason:'Found a home elsewhere',
    updated_at:d1(`SELECT updated_at FROM applicants WHERE id=${ana}`)[0].updated_at},'post');
   assert.deepEqual(bens(),kept);
   assert.deepEqual(offered().map(l=>l.availability),['for_sale','for_sale'],'resolving a search says nothing about the listings');
   await page.reload();
   await page.getByText('Reopen this search to review its matches.',{exact:true}).first().waitFor();
   await settled('shortlisted',1);
   // Her own decision is kept as history; a closed search approves nothing until it is reopened and reviewed again.
   await says(card('shortlisted',1),'Decision',`Approval out of date Shortlisted by ${ADMIN} · `);
   assert.equal(await card('shortlisted',1).getByRole('button',{name:/^Review again/}).isDisabled(),true,'a resolved search is read only');
   await page.goto(base+`admin/#/applicants/${ben}/matches`);
   await settled('shortlisted',1);await settled('found',1);
   await says(card('shortlisted',1),'Decision',`Shortlisted by ${ADMIN} · `);
   assert.equal(await card('shortlisted',1).getByRole('button',{name:/^Undo/}).isDisabled(),false);
   // The home goes under offer: that is what the listing says, shown beside an evaluation that has not changed.
   d1(`UPDATE listings SET availability='under_offer' WHERE id='${lid(1)}'`);
   await page.reload();
   await settled('shortlisted',1);
   await says(card('shortlisted',1),'Availability','Not confirmed · Listed as Under offer');
   await says(card('shortlisted',1),'Evaluation','Stated must-haves met');
   await says(card('shortlisted',1),'Decision','Approval out of date');
   await fits("Ben's Matches");

   // The Review queue: Ben's other home can be asked about without being decided.
   await page.goto(base+'admin/#/review');
   const queued=page.locator('.review .match');
   await queued.getByRole('link',{name:home(2),exact:true}).waitFor();
   await says(queued,'Enquiry','Not sent · Parking to clarify');
   await queued.getByRole('button',{name:`Approve clarification for ${home(2)}`,exact:true}).focus();
   await page.keyboard.press('Enter');
   await page.locator('.review-msg').filter({hasText:'Clarification approved. It shortlists nothing: this match is still to review.'}).waitFor();
   await says(queued,'Enquiry',`Clarification approved · Parking by ${ADMIN} · `);
   await says(queued,'Decision','Not decided');
   await fits('Review');
   if(shots)await page.screenshot({path:join(shots,`est13-review-${width}.png`),fullPage:true});
   await queued.getByRole('button',{name:`Withdraw clarification for ${home(2)}`,exact:true}).focus();
   await page.keyboard.press('Enter');
   await page.locator('.review-msg').filter({hasText:'Clarification withdrawn.'}).waitFor();
   await says(queued,'Enquiry','Not sent · Parking to clarify');
   assert.deepEqual(d1(`SELECT status FROM matches WHERE applicant_id=${ben} AND listing_id='${lid(2)}'`),[{status:'found'}]);
   assert.deepEqual(d1(`SELECT json_extract(data,'$.approved') AS approved,actor FROM events WHERE type='match.clarification' AND entity_id='${ben}' ORDER BY id`),
    [{approved:1,actor:ADMIN},{approved:0,actor:ADMIN}]);
   await page.close();
  }
  assert.deepEqual(errors,[]);
  console.log('EST-13 E2E passed: 1280/390, four separate states per card, clarification approved and withdrawn without deciding, outdated approval and Review again, another search resolved, listing under offer, Timeline.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
