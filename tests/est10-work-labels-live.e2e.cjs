// Isolated local fixtures only: E2E_PRODUCTION_READONLY=0 E2E_SCRIPT=tests/est10-work-labels-live.e2e.cjs npm run test:e2e:isolated
// EST-10: the applicants list shows several work labels at once, each from its real source (an essential fact to confirm
// on a match, a viewing a person linked to the search through VIS-17, BUS-17's open review), filters by each, and never
// borrows a viewing by email. Reading closes no search and changes nothing. At 1280 and 390.
const assert=require('node:assert/strict');
const {readFileSync,mkdirSync}=require('node:fs');
const {join,dirname}=require('node:path');
const {parseEnv}=require('node:util');
const {execFileSync}=require('node:child_process');
const {chromium,webkit}=require(process.env.PW||'playwright-core');
(async()=>{
 assert.equal(process.env.HAMPTON_E2E_ISOLATED,'1');assert.equal(process.env.E2E_PRODUCTION_READONLY,'0');
 const vars=parseEnv(readFileSync(process.env.E2E_VARS,'utf8')),{signSession,COOKIE}=await import('../server/auth.js');
 assert.equal(vars.EST10_LABELS_READY,'1');
 const base=process.env.BASE.replace('127.0.0.1','localhost'),ADMIN='admin@example.test',T='2026-11-14T10:00:00.000Z';
 const day=n=>new Date(Date.now()+n*864e5).toISOString().slice(0,10);
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
   console.log('EST10 width',width);
   // Many: a found home with a must-have to confirm, a booked viewing linked by a person and BUS-17's review open.
   // Pending: a viewing whose time is still being agreed. Unlinked: a confirmed viewing from the same email, never linked.
   const lid=`HE-R10${width}`,names=['Many','Pending','Unlinked'].map(n=>`EST10 ${n} ${width}`);
   d1(insert('listings',{id:lid,title:`EST10 ${width} home`,use:'residential',operation:'rent',availability:'to_let',rent:1800,rent_period:'month',
     currency:'GBP',country:'Jersey',parish:'St Helier',bedrooms:2,bathrooms:1,published:0,matchable:1,specs:'[]',created_at:T,updated_at:T,updated_by:'fixture'})
    +names.map((name,i)=>insert('contacts',{name,email:`est10-${i}-${width}@example.test`,last_activity_at:T,created_at:T,updated_at:T})).join(''));
   const contact=name=>d1(`SELECT id FROM contacts WHERE name=${value(name)}`)[0].id;
   d1(names.map(name=>insert('applicants',{contact_id:contact(name),stage:'searching',source:'phone',operation:'rent',budget_max:2000,created_at:T,updated_at:T})).join(''));
   const [many,pending,unlinked]=names.map(name=>d1(`SELECT id FROM applicants WHERE contact_id=${contact(name)}`)[0].id);
   const viewingRow=(i,status)=>insert('viewing_requests',{listing_id:lid,listing_ref:lid,kind:'In person',date:day(3),time:'10:00',end_time:'10:30',
     name:names[i],email:`est10-${i}-${width}@example.test`,status,created_at:T,updated_at:T,negotiator_id:1});
   d1(insert('matches',{applicant_id:many,listing_id:lid,score:70,checks:'[]',status:'found',requirements_rank:1,created_at:T,updated_at:T})
    +viewingRow(0,'confirmed')+viewingRow(1,'requested')+viewingRow(2,'confirmed')
    +insert('search_reviews',{applicant_id:many,episode:1,cycle:1,due_at:T,opened_at:T,alternatives:'[]'}));
   const viewing=i=>d1(`SELECT id FROM viewing_requests WHERE email='est10-${i}-${width}@example.test'`)[0].id;
   const proposal=(i,a,state)=>insert('viewing_proposals',{viewing_id:viewing(i),revision:1,applicant_id:a,negotiator_id:1,date:day(3),time:'10:00',
     end_time:'10:30',from_status:'requested',from_negotiator_id:1,from_date:day(3),from_time:'10:00',required:'["client"]',state,created_at:T,
     created_by:ADMIN,closed_at:state==='open'?null:T,closed_by:state==='open'?null:ADMIN});
   const review=d1(`SELECT id FROM search_reviews WHERE applicant_id=${many}`)[0].id;
   d1(proposal(0,many,'confirmed')+proposal(1,pending,'open')
    +insert('events',{at:T,actor:'system',entity_type:'applicant',entity_id:String(many),type:'applicant.search_review',data:JSON.stringify({review_id:review})}));
   const event=d1(`SELECT id FROM events WHERE type='applicant.search_review' AND entity_id='${many}'`)[0].id;
   d1(insert('notifications',{event_id:event,category:'task',title:'Review search',task_reason:'Fixture',action_required:1,created_at:T,task_key:`bus17:review:${review}`}));
   const before=d1(`SELECT id,search_state,updated_at FROM applicants WHERE id IN (${many},${pending},${unlinked}) ORDER BY id`);

   const page=await ctx.newPage();page.on('pageerror',e=>errors.push(e.message));
   page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
   page.setDefaultTimeout(15000);
   await page.setViewportSize({width,height:900});
   await page.goto(base+'admin/#/applicants');
   const row=name=>page.getByRole('row').filter({has:page.getByRole('link',{name,exact:true})});
   const labels=name=>row(name).locator('td[data-label="Work labels"] .badge');
   await row(names[0]).waitFor();
   assert.deepEqual(await labels(names[0]).allInnerTexts(),['Waiting for review','Requirement to confirm','Viewing booked','Search review due']);
   assert.deepEqual(await labels(names[1]).allInnerTexts(),['Viewing pending']);
   assert.deepEqual(await labels(names[2]).allInnerTexts(),[],'a viewing from the same email is not linked');
   await page.getByText(/Search review due: the internal review after 21 days/).waitFor();
   // Every badge wraps inside the page: no sideways scroll, each one on screen.
   for(const box of await Promise.all((await labels(names[0]).all()).map(b=>b.boundingBox())))assert.ok(box.x>=0&&box.x+box.width<=width+1,`badge inside ${width}`);
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth+1),`no sideways scroll at ${width}`);
   if(shots)await row(names[0]).screenshot({path:join(shots,`est10-labels-${width}.png`)});

   // Each label filters, by keyboard too.
   const filter=page.getByLabel('Work label');
   await filter.focus();
   assert.equal(await filter.evaluate(el=>el===document.activeElement),true);
   for(const [label,shown] of [['viewing_booked',[0]],['viewing_pending',[1]],['search_review',[0]],['essential',[0]]]){
    await filter.selectOption(label);
    await row(names[shown[0]]).waitFor();
    for(const i of [0,1,2].filter(i=>!shown.includes(i)))await row(names[i]).waitFor({state:'detached'});
   }
   assert.deepEqual(d1(`SELECT id,search_state,updated_at FROM applicants WHERE id IN (${many},${pending},${unlinked}) ORDER BY id`),before,'reading changes no search');
   await page.close();
  }
  assert.deepEqual(errors,[]);
  console.log('EST-10 live work labels: ok');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
