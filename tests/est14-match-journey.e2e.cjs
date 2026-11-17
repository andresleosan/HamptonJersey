// Isolated local fixtures only: E2E_PRODUCTION_READONLY=0 E2E_SCRIPT=tests/est14-match-journey.e2e.cjs npm run test:e2e:isolated
// EST-14: a match card shows the client's word and the journey step, each from its own fact, with the history linking to
// its records; a person records the client's no with a reason, and nothing else changes. At 1280 and 390.
const assert=require('node:assert/strict');
const {readFileSync,mkdirSync}=require('node:fs');
const {join,dirname}=require('node:path');
const {parseEnv}=require('node:util');
const {execFileSync}=require('node:child_process');
const {chromium,webkit}=require(process.env.PW||'playwright-core');
(async()=>{
 assert.equal(process.env.HAMPTON_E2E_ISOLATED,'1');assert.equal(process.env.E2E_PRODUCTION_READONLY,'0');
 const vars=parseEnv(readFileSync(process.env.E2E_VARS,'utf8')),{signSession,COOKIE}=await import('../server/auth.js');
 assert.equal(vars.EST14_JOURNEY_READY,'1');
 const base=process.env.BASE.replace('127.0.0.1','localhost'),ADMIN='admin@example.test',T='2026-11-14T10:00:00.000Z';
 const shots=process.env.E2E_SHOTS;if(shots)mkdirSync(shots,{recursive:true});
 const wrangler=join(dirname(require.resolve('wrangler')),'..','bin','wrangler.js');
 const d1=sql=>JSON.parse(execFileSync(process.execPath,[wrangler,'d1','execute','hampton','--local','--persist-to',process.env.E2E_PERSIST,
  '--json','--command',sql],{encoding:'utf8',stdio:['ignore','pipe','pipe']})).at(-1).results;
 const value=v=>v==null?'NULL':typeof v==='number'?String(v):`'${String(v).replaceAll("'","''")}'`;
 const insert=(table,row)=>`INSERT INTO ${table}(${Object.keys(row)}) VALUES(${Object.values(row).map(value)});`;
 const browser=await (process.env.HAMPTON_E2E_BROWSER==='webkit'?webkit:chromium).launch({executablePath:process.env.CHROME});
 try{
  const ctx=await browser.newContext();
  await ctx.addCookies([{name:COOKIE,value:await signSession(ADMIN,vars.SESSION_SECRET),domain:new URL(base).hostname,path:'/',httpOnly:true,secure:true,sameSite:'Strict'}]);
  await ctx.route('https://fonts.googleapis.com/**',route=>route.fulfill({status:200,contentType:'text/css',body:''}));
  const errors=[];
  for(const width of [1280,390]){
   console.log('EST14 width',width);
   // One home for sale and two searches to buy it, both shortlisted. Buyer: a rejected offer, an open one and a viewing
   // a person linked to this search and everyone accepted. Other: a website viewing from the same home, never linked.
   const lid=`HE-S14${width}`,names=[`EST14 Buyer ${width}`,`EST14 Other ${width}`];
   d1(insert('listings',{id:lid,title:`EST14 ${width} home`,use:'residential',operation:'sale',availability:'for_sale',sale_price:790000,currency:'GBP',
     country:'Jersey',parish:'St Saviour',bedrooms:3,bathrooms:2,published:0,matchable:1,specs:'[]',created_at:T,updated_at:T,updated_by:'fixture'})
    +names.map((name,i)=>insert('contacts',{name,email:`est14-${i}-${width}@example.test`,last_activity_at:T,created_at:T,updated_at:T})).join(''));
   const contact=name=>d1(`SELECT id FROM contacts WHERE name=${value(name)}`)[0].id;
   d1(names.map(name=>insert('applicants',{contact_id:contact(name),stage:'searching',source:'phone',operation:'buy',budget_max:1000000,created_at:T,updated_at:T})).join(''));
   const [buyer,other]=names.map(name=>d1(`SELECT id FROM applicants WHERE contact_id=${contact(name)}`)[0].id);
   const match=a=>insert('matches',{applicant_id:a,listing_id:lid,score:80,checks:'[]',status:'shortlisted',reviewed_by:ADMIN,reviewed_at:T,created_at:T,updated_at:T});
   d1(match(buyer)+match(other)
    +insert('offers',{listing_id:lid,applicant_id:buyer,amount:700000,status:'rejected',note:'Too low',created_at:T,updated_at:'2026-11-14T11:00:00.000Z'})
    +insert('offers',{listing_id:lid,applicant_id:buyer,amount:745000,status:'pending',created_at:T,updated_at:'2026-11-14T12:00:00.000Z'})
    +insert('viewing_requests',{listing_id:lid,listing_ref:lid,kind:'In person',date:'2026-11-20',time:'10:00',end_time:'10:30',name:names[0],
      email:`est14-0-${width}@example.test`,status:'confirmed',created_at:T,updated_at:T,negotiator_id:1})
    +insert('viewing_requests',{listing_id:lid,listing_ref:lid,kind:'In person',date:'2026-11-21',time:'10:00',end_time:'10:30',name:names[1],
      email:`est14-1-${width}@example.test`,status:'completed',outcome:'proceed',created_at:T,updated_at:T,negotiator_id:1}));
   const [offerRejected,offerOpen]=d1(`SELECT id FROM offers WHERE listing_id='${lid}' ORDER BY id`).map(o=>o.id);
   const viewing=d1(`SELECT id FROM viewing_requests WHERE listing_id='${lid}' AND status='confirmed'`)[0].id;
   d1(insert('viewing_proposals',{viewing_id:viewing,revision:1,applicant_id:buyer,negotiator_id:1,date:'2026-11-20',time:'10:00',end_time:'10:30',
     from_status:'requested',from_negotiator_id:1,from_date:'2026-11-19',from_time:'10:00',required:'["client"]',state:'confirmed',
     created_at:T,created_by:ADMIN,closed_at:T,closed_by:ADMIN}));
   const listingBefore=d1(`SELECT availability,updated_at FROM listings WHERE id='${lid}'`)[0];

   const page=await ctx.newPage();page.on('pageerror',e=>errors.push(e.message));
   page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
   page.setDefaultTimeout(15000);
   await page.setViewportSize({width,height:900});
   const state=(card,label)=>card.locator('dl.match-states > div').filter({has:page.locator('dt',{hasText:new RegExp(`^${label}$`)})}).locator('dd');
   const text=async l=>(await l.innerText()).replace(/\s+/g,' ').trim();

   // The other search: nothing said, nothing linked; the unlinked viewing is not borrowed (no link by similarity).
   await page.goto(base+`admin/#/applicants/${other}/matches`);
   let card=page.locator('article.match').filter({hasText:`EST14 ${width} home`});
   await card.waitFor();
   assert.equal(await text(state(card,'Client')),'No answer recorded');
   assert.equal(await text(state(card,'Journey')),'Not started');
   await card.getByRole('button',{name:/Journey history \(0\)/}).click();
   await card.getByText('Nothing yet: no answer, viewing, offer or agreement is linked').waitFor();

   // The buyer: the open offer is the step in force; the history keeps the rejected price and links every record.
   await page.goto(base+`admin/#/applicants/${buyer}/matches`);
   card=page.locator('article.match').filter({hasText:`EST14 ${width} home`});
   await card.waitFor();
   assert.equal(await text(state(card,'Client')),'No answer recorded');
   assert.equal(await text(state(card,'Journey')),'Offer');
   const history=card.getByRole('button',{name:/Journey history \(3\)/});
   await history.focus();await page.keyboard.press('Enter');
   assert.equal(await history.getAttribute('aria-expanded'),'true');
   const items=card.locator('.journey-history li');
   assert.equal(await items.count(),3);
   assert.match(await text(items.nth(0)),/^Offer £745,000 pending/);
   assert.equal(await items.nth(0).getByRole('link',{name:'Open offer'}).getAttribute('href'),`#/sales?offer=${offerOpen}`);
   assert.match(await text(items.nth(1)),/^Offer £700,000 rejected/);
   assert.equal(await items.nth(1).getByRole('link',{name:'Open offer'}).getAttribute('href'),`#/sales?offer=${offerRejected}`);
   assert.match(await text(items.nth(2)),/booked: everyone accepted/);
   assert.equal(await items.nth(2).getByRole('link',{name:'Open viewing'}).getAttribute('href'),`#/viewings?listing=${lid}&viewing=${viewing}`);
   if(shots)await card.screenshot({path:join(shots,`est14-journey-${width}.png`)});

   // The client's no: a reason is required, Other needs a note, Escape gives the focus back.
   const decline=card.getByRole('button',{name:/^Client not interested/});
   await decline.click();
   const form=card.getByRole('form',{name:/Why is the client not interested/});
   await form.waitFor();
   assert.equal(await page.evaluate(()=>document.activeElement.tagName),'SELECT');
   await page.keyboard.press('Escape');
   assert.equal(await form.count(),0);
   assert.equal(await decline.evaluate(el=>el===document.activeElement),true);
   await decline.click();
   await form.getByLabel('Why',{exact:true}).selectOption('other');
   await form.getByRole('button',{name:/^Save/}).click();
   await form.getByRole('alert').getByText('Say why in a few words').waitFor();
   assert.equal(await form.getByLabel(/^Note/).getAttribute('aria-invalid'),'true');
   await form.getByLabel('Why',{exact:true}).selectOption('price');
   await form.getByLabel(/^Note/).fill('');
   await form.getByRole('button',{name:/^Save/}).click();
   await page.getByRole('status').getByText(/Recorded: the client is not interested in EST14 .* · Price\. The match, the requirements and the property stay as they are\./).waitFor();
   card=page.locator('article.match').filter({hasText:`EST14 ${width} home`});
   await state(card,'Client').getByText('Not interested').waitFor();
   assert.equal(await text(state(card,'Journey')),'Offer','an open offer stands over a word');
   assert.equal(await text(state(card,'Decision')).then(t=>t.includes('Shortlisted')),true,'the decision is the employee\'s');
   assert.deepEqual(d1(`SELECT availability,updated_at FROM listings WHERE id='${lid}'`)[0],listingBefore,'the property stays offered');
   assert.deepEqual(d1(`SELECT status FROM matches WHERE listing_id='${lid}' ORDER BY applicant_id`).map(r=>r.status),['shortlisted','shortlisted']);
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth+1),`no sideways scroll at ${width}`);
   if(shots)await page.screenshot({path:join(shots,`est14-matches-${width}.png`),fullPage:true});

   // BUS-18: the property shows each search's own word in its Client column.
   await page.goto(base+`admin/#/p/${lid}`);
   const section=page.locator('#s-applicants');
   await section.getByRole('heading',{name:'Matched applicants (2)'}).waitFor();
   if(width===1280)assert.deepEqual(await section.locator('thead th').allInnerTexts(),
     ['Applicant','Looking','Evaluation','Decision','Availability','Enquiry','Client','Score']);
   const client=name=>section.locator('tbody tr').filter({has:page.getByRole('link',{name})}).locator('td[data-label="Client"]');
   assert.equal((await client(names[0]).innerText()).replace(/^\w+: /,'').trim(),'Not interested');
   assert.equal((await client(names[1]).innerText()).replace(/^\w+: /,'').trim(),'No answer recorded');
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth+1),`no sideways scroll at ${width}`);
   await page.close();
  }
  assert.deepEqual(errors,[]);
  console.log('EST-14 match journey: ok');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
