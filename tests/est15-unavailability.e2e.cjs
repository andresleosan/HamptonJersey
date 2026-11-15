// Isolated local fixtures only: E2E_PRODUCTION_READONLY=0 E2E_SCRIPT=tests/est15-unavailability.e2e.cjs npm run test:e2e:isolated
const assert=require('node:assert/strict');
const {readFileSync,mkdirSync}=require('node:fs');
const {join,dirname}=require('node:path');
const {parseEnv}=require('node:util');
const {execFileSync}=require('node:child_process');
const {chromium,webkit}=require(process.env.PW||'playwright-core');
(async()=>{
 assert.equal(process.env.HAMPTON_E2E_ISOLATED,'1');assert.equal(process.env.E2E_PRODUCTION_READONLY,'0');
 const vars=parseEnv(readFileSync(process.env.E2E_VARS,'utf8')),{signSession,COOKIE}=await import('../server/auth.js');
 assert.equal(vars.EST16_AVAILABILITY_READY,'1');assert.equal(vars.EST15_UNAVAILABILITY_READY,'1');
 const {extractFeatures}=await import('../server/listing-features.js');
 const {jerseyToday,plusDays}=await import('../server/viewings.js');
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
   console.log('EST15 width',width);
   // One home for sale: proposed to Ana, shortlisted for Ben, with a viewing tomorrow and one that is over.
   const home=`EST15 ${width} home`,lid=`HE-F${width}`,EVIDENCE=`Call note E2E-EVIDENCE ${width}`,visitor=`EST15 Visitor ${width}`;
   const row={id:lid,title:home,use:'residential',operation:'sale',availability:'for_sale',matchable:1,sale_price:900000,currency:'GBP',
    country:'Jersey',bedrooms:3,bathrooms:2,published:0,created_at:'2026-11-09T10:00:00.000Z',updated_at:'2026-11-09T10:00:00.000Z',
    updated_by:'fixture',...extractFeatures({description:'Parking for two cars'}),parish:'St Helier'};
   d1(`UPDATE listings SET matchable=0;DELETE FROM matches;INSERT INTO listings(${Object.keys(row)}) VALUES(${Object.values(row).map(value)});`);
   const person=async name=>{
    const made=await ctx.request.post(base+'api/admin/applicants',{headers:{origin},data:{name,email:`${name.toLowerCase().replaceAll(' ','-')}@example.test`,
     operation:'buy',source:'phone',budget_max:1000000,parking_spaces:2,pets:[{kind:'none'}],
     requirement_priorities:{version:1,values:{budget:'must',parking:'must'},unknown:[]}}});
    assert.equal(made.status(),201,await made.text());return (await made.json()).id;
   };
   const ana=await person(`EST15 Ana ${width}`),ben=await person(`EST15 Ben ${width}`);
   const [{id:mid}]=d1(`SELECT id FROM matches WHERE applicant_id=${ben} AND listing_id='${lid}'`);
   const kept=await ctx.request.put(base+`api/admin/matches/${mid}`,{headers:{origin},data:{status:'shortlisted',from:'found'}});
   assert.equal(kept.status(),200,await kept.text());
   const tomorrow=plusDays(jerseyToday(),1),yesterday=plusDays(jerseyToday(),-1);
   d1(`INSERT INTO viewing_requests(listing_id,kind,date,time,end_time,name,email,status,created_at) VALUES
    ('${lid}','In person','${tomorrow}','10:00','10:30','${visitor}','est15-visitor-${width}@example.test','confirmed','2026-11-09T10:00:00.000Z'),
    ('${lid}','In person','${yesterday}','10:00','10:30','EST15 Past ${width}','est15-past-${width}@example.test','confirmed','2026-11-09T10:00:00.000Z');`);
   const [{id:vid}]=d1(`SELECT id FROM viewing_requests WHERE name='${visitor}'`);
   const page=await ctx.newPage();page.on('pageerror',e=>errors.push(e.message));
   page.setDefaultTimeout(15000);
   await page.setViewportSize({width,height:900});
   const fits=async where=>assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth+1),`no sideways scroll: ${where} at ${width}`);
   const text=async where=>(await where.innerText()).replace(/\s+/g,' ').trim();
   // Polled to its final text, because lists and cards reload after every action.
   const says=async(where,label,expected)=>{
    const ok=async()=>{if(await where.count()!==1)return false;const t=await text(where);return t.startsWith(expected[0])&&expected.every(part=>t.includes(part));};
    for(let i=0;i<80&&!(await ok());i++)await page.waitForTimeout(100);
    assert.ok(await ok(),`${label}: "${await text(where)}" should start with "${expected[0]}" and include ${JSON.stringify(expected.slice(1))}`);
   };
   const group=status=>page.locator('.match-group').filter({has:page.locator(`#group-${status}`)});
   const card=status=>group(status).locator('article.match').filter({has:page.getByRole('link',{name:home,exact:true})});
   const state=(where,label)=>where.locator('dl.match-states > div').filter({has:page.locator('dt',{hasText:label})}).locator('dd');
   // The Matches tab of a search, loaded, with `n` cards of the home in that group.
   const matches=async(applicant,status,n)=>{
    await page.goto(base+`admin/#/applicants/${applicant}/matches`);
    const ready=async()=>await group(status).count()===1&&await group(status).getAttribute('aria-busy')==='false'&&await card(status).count()===n;
    for(let i=0;i<80&&!(await ready());i++)await page.waitForTimeout(100);
    assert.ok(await ready(),`${n} ${status} card(s) of the home`);
   };
   const listed=()=>d1(`SELECT availability,published,archived_at,matchable,updated_at FROM listings WHERE id='${lid}'`);
   // Of these two searches: the fixture's own active searches are proposed the home too once it is recomputed.
   const stored=()=>d1(`SELECT applicant_id,status FROM matches WHERE listing_id='${lid}' AND applicant_id IN (${ana},${ben}) ORDER BY applicant_id`);
   const viewings=()=>d1(`SELECT id,status,date,time FROM viewing_requests WHERE listing_id='${lid}' ORDER BY id`);
   const before=listed(),booked=viewings();
   assert.deepEqual(stored(),[{applicant_id:ana,status:'found'},{applicant_id:ben,status:'shortlisted'}]);
   await matches(ana,'found',1);

   // The property's editor says what a confirmed unavailability does before anything is recorded.
   await page.goto(base+`admin/#/p/${lid}`);
   const section=page.locator('#s-availability');
   await section.getByRole('heading',{name:'Confirmed availability (internal)'}).waitFor();
   await section.getByText('Nothing is cancelled, archived or sent to a client',{exact:false}).waitFor();
   const fact=label=>section.locator('dl.kv > div').filter({has:page.locator('dt',{hasText:label})}).locator('dd');
   const submit=section.getByRole('button',{name:'Record confirmation',exact:true});
   const record=async status=>{
    const pending=page.waitForResponse(r=>r.request().method()==='POST'&&new URL(r.url()).pathname===`/api/admin/listings/${lid}/availability`);
    await submit.focus();await page.keyboard.press('Enter');
    assert.equal((await pending).status(),status);
   };
   const fill=async({status,at,source,channel,scope,evidence})=>{
    await section.getByLabel('What was confirmed').selectOption(status);
    await section.getByLabel('Confirmed on (your time zone)').fill(at);
    await section.getByLabel('Who confirmed it').selectOption(source);
    await section.getByLabel('How it was confirmed').selectOption(channel);
    await section.getByLabel('It covers').selectOption(scope);
    await section.getByLabel('Evidence reference').fill(evidence);
   };
   // The reason is asked only for Not available, and a confirmation without it is refused next to its field.
   const why=section.getByLabel('Why it is not available');
   assert.equal(await why.count(),0);
   await fill({status:'unavailable',at:'2025-06-01T15:00',source:'agency',channel:'email',scope:'operation',evidence:EVIDENCE});
   await why.waitFor();
   await record(400);
   await section.getByText('Choose why it is not available',{exact:true}).waitFor();
   assert.equal(await why.getAttribute('aria-invalid'),'true');
   assert.deepEqual(d1(`SELECT COUNT(*) AS n FROM availability_confirmations WHERE listing_id='${lid}'`),[{n:0}]);
   await fits('editor, refused');
   if(shots)await section.screenshot({path:join(shots,`est15-refused-${width}.png`)});

   // The agency wrote that it is sold: recorded, and the card says what happened.
   await why.selectOption('sold');
   await record(201);
   await section.getByRole('status').filter({hasText:"Confirmation recorded. The listing's own status was not changed. It is no longer proposed as a new match, and 1 upcoming viewing has a task in the Inbox."}).waitFor();
   await says(fact('Confirmed availability'),'editor',['Not available · Sold · 1 Jun 2025',`Agency by email · recorded by ${ADMIN} · Only its sale`]);
   await says(fact('Published status'),'editor',['For sale']);
   await says(section.locator('.confirmations li').first(),'history',['Not available · Sold · 1 Jun 2025',`Evidence: ${EVIDENCE}`]);
   assert.equal(await why.count(),0,'the form starts again');
   assert.deepEqual(listed(),before,'a confirmed unavailability archives, unpublishes and changes nothing of the listing');
   assert.deepEqual(viewings(),booked,'and cancels no viewing');
   assert.deepEqual(stored(),[{applicant_id:ben,status:'shortlisted'}],'the proposal goes and the shortlisted match stays');
   await fits('editor, not available');
   if(shots)await section.screenshot({path:join(shots,`est15-unavailable-${width}.png`)});

   // Ana is no longer proposed the home; Ben keeps his shortlisted match, marked.
   await matches(ana,'found',0);
   await fits('Matches, proposal withdrawn');
   await matches(ben,'shortlisted',1);
   await says(state(card('shortlisted'),'Availability'),'card',['Confirmed not available · 1 Jun 2025',`Agency by email · recorded by ${ADMIN} · Listed as For sale`]);
   await says(state(card('shortlisted'),'Decision'),'card',['Shortlisted']);
   assert.equal((await text(card('shortlisted'))).includes('E2E-EVIDENCE'),false,'the evidence text stays with the property');
   await fits('Matches, shortlisted kept');
   if(shots)await page.screenshot({path:join(shots,`est15-card-${width}.png`),fullPage:true});

   // The Inbox has one task for the viewing still to come, none for the one that is over, and it opens the viewing.
   const title=`Property confirmed not available: ${visitor}`;
   const inbox=await (await ctx.request.get(base+'api/admin/notifications?box=action')).json();
   assert.deepEqual(inbox.notifications.filter(n=>n.title.includes(`${width}`)&&n.title.startsWith('Property confirmed not available')).map(n=>[n.title,n.category,n.link]),
    [[title,'task',`#/viewings?viewing=${vid}`]]);
   assert.equal(JSON.stringify(inbox).includes('E2E-EVIDENCE'),false,'the evidence text is in no notice');
   await page.goto(base+'admin/#/');
   const task=page.locator('.inbox-list li').filter({hasText:title});
   await task.waitFor();
   await task.getByRole('button').click();
   const notice=page.locator('article.inbox-detail');
   await notice.getByRole('heading',{name:title}).waitFor();
   await fits('Inbox');
   if(shots)await page.screenshot({path:join(shots,`est15-inbox-${width}.png`)});
   await notice.getByRole('link',{name:'Open viewing'}).click();
   await page.locator('article.inbox-detail').getByRole('heading',{name:new RegExp(visitor)}).waitFor();

   // The owner then says it is available again: only that proposes it again, and no second task appears.
   await page.goto(base+`admin/#/p/${lid}`);
   await section.getByRole('heading',{name:'Confirmation history (1)'}).waitFor();
   await fill({status:'available',at:'2025-07-01T09:00',source:'owner',channel:'phone',scope:'property',evidence:EVIDENCE});
   await record(201);
   await says(section.getByRole('status'),'editor',["Confirmation recorded. The listing's own status was not changed."]);
   assert.equal((await text(section.getByRole('status'))).includes('no longer proposed'),false);
   await says(fact('Confirmed availability'),'editor',['Available · 1 Jul 2025']);
   assert.deepEqual(stored(),[{applicant_id:ana,status:'found'},{applicant_id:ben,status:'shortlisted'}]);
   await matches(ana,'found',1);
   await says(state(card('found'),'Availability'),'card',['Confirmed · 1 Jul 2025']);
   await fits('Matches, proposed again');

   assert.deepEqual(d1(`SELECT status,reason,operation,recorded_by FROM availability_confirmations WHERE listing_id='${lid}' ORDER BY id`),
    [{status:'unavailable',reason:'sold',operation:'sale',recorded_by:ADMIN},{status:'available',reason:null,operation:null,recorded_by:ADMIN}]);
   assert.deepEqual(d1(`SELECT COUNT(*) AS n FROM events WHERE type='viewing.property_unavailable' AND entity_id='${vid}'`),[{n:1}]);
   assert.deepEqual(d1(`SELECT COUNT(*) AS n FROM events WHERE data LIKE '%E2E-EVIDENCE%'`),[{n:0}],'no event carries the evidence text');
   assert.deepEqual(listed(),before);assert.deepEqual(viewings(),booked);
   await page.close();
  }
  assert.deepEqual(errors,[]);
  console.log('EST-15 E2E passed: 1280/390, a reason asked for Not available and refused without it, the proposal withdrawn and the shortlisted match kept and marked, one Inbox task for the upcoming viewing opening it, the listing and its viewings untouched, and the home proposed again only after a newer confirmation.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
