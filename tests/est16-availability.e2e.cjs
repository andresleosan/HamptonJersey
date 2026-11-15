// Isolated local fixtures only: E2E_PRODUCTION_READONLY=0 E2E_SCRIPT=tests/est16-availability.e2e.cjs npm run test:e2e:isolated
const assert=require('node:assert/strict');
const {readFileSync,mkdirSync}=require('node:fs');
const {join,dirname}=require('node:path');
const {parseEnv}=require('node:util');
const {execFileSync}=require('node:child_process');
const {chromium,webkit}=require(process.env.PW||'playwright-core');
(async()=>{
 assert.equal(process.env.HAMPTON_E2E_ISOLATED,'1');assert.equal(process.env.E2E_PRODUCTION_READONLY,'0');
 const vars=parseEnv(readFileSync(process.env.E2E_VARS,'utf8')),{signSession,COOKIE}=await import('../server/auth.js');
 assert.equal(vars.EST16_AVAILABILITY_READY,'1');
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
   console.log('EST16 width',width);
   // One home for sale, proposed to Ana.
   const home=`EST16 ${width} home`,lid=`HE-E${width}`,EVIDENCE=`Call note E2E-EVIDENCE ${width}`;
   const row={id:lid,title:home,use:'residential',operation:'sale',availability:'for_sale',matchable:1,sale_price:900000,currency:'GBP',
    country:'Jersey',bedrooms:3,bathrooms:2,published:0,created_at:'2026-11-09T10:00:00.000Z',updated_at:'2026-11-09T10:00:00.000Z',
    updated_by:'fixture',...extractFeatures({description:'Parking for two cars'}),parish:'St Helier'};
   d1(`UPDATE listings SET matchable=0;DELETE FROM matches;INSERT INTO listings(${Object.keys(row)}) VALUES(${Object.values(row).map(value)});`);
   const made=await ctx.request.post(base+'api/admin/applicants',{headers:{origin},data:{name:`EST16 Ana ${width}`,email:`est16-ana-${width}@example.test`,
    operation:'buy',source:'phone',budget_max:1000000,parking_spaces:2,pets:[{kind:'none'}],
    requirement_priorities:{version:1,values:{budget:'must',parking:'must'},unknown:[]}}});
   assert.equal(made.status(),201,await made.text());const ana=(await made.json()).id;
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
   const card=()=>group('found').locator('article.match').filter({has:page.getByRole('link',{name:home,exact:true})});
   const state=(where,label)=>where.locator('dl.match-states > div').filter({has:page.locator('dt',{hasText:label})}).locator('dd');
   const matches=async()=>{
    await page.goto(base+`admin/#/applicants/${ana}/matches`);
    for(let i=0;i<80&&!(await group('found').getAttribute('aria-busy')==='false'&&await card().count()===1);i++)await page.waitForTimeout(100);
    assert.equal(await card().count(),1,'one found match');
   };
   const listed=()=>d1(`SELECT availability,published,archived_at,matchable,updated_at FROM listings WHERE id='${lid}'`);
   const found=()=>d1(`SELECT status FROM matches WHERE applicant_id=${ana} AND listing_id='${lid}'`);
   const before=listed();

   // Nothing confirmed yet: the card says so beside what the listing says.
   await matches();
   await says(state(card(),'Availability'),'card',['Not confirmed · Listed as For sale']);
   await says(state(card(),'Decision'),'card',['Not decided']);

   // The property's editor: three separate things, and nothing recorded.
   await page.goto(base+`admin/#/p/${lid}`);
   const section=page.locator('#s-availability');
   await section.getByRole('heading',{name:'Confirmed availability (internal)'}).waitFor();
   const fact=label=>section.locator('dl.kv > div').filter({has:page.locator('dt',{hasText:label})}).locator('dd');
   await says(fact('Published status'),'editor',["For sale · Source: this listing's own Availability field"]);
   await says(fact('Confirmed availability'),'editor',['Not confirmed']);
   await section.getByText('No confirmation recorded yet.',{exact:true}).waitFor();
   const submit=section.getByRole('button',{name:'Record confirmation',exact:true});
   const record=async status=>{
    const pending=page.waitForResponse(r=>r.request().method()==='POST'&&new URL(r.url()).pathname===`/api/admin/listings/${lid}/availability`);
    await submit.focus();await page.keyboard.press('Enter');
    assert.equal((await pending).status(),status);
   };
   // By keyboard, with nothing chosen: each missing part is said next to its field and nothing is recorded.
   await record(400);
   await section.getByRole('alert').filter({hasText:'Please check the highlighted fields.'}).waitFor();
   for(const message of ['Choose what was confirmed','Choose who confirmed it','Choose how it was confirmed','Say where the evidence is, in 300 characters or fewer'])
    await section.getByText(message,{exact:true}).waitFor();
   assert.equal(await section.getByLabel('What was confirmed').getAttribute('aria-invalid'),'true');
   assert.deepEqual(d1(`SELECT COUNT(*) AS n FROM availability_confirmations WHERE listing_id='${lid}'`),[{n:0}]);
   await fits('editor, refused');
   if(shots)await section.screenshot({path:join(shots,`est16-refused-${width}.png`)});

   // The owner confirmed by phone that it is available.
   const fill=async({status,at,source,channel,scope,evidence})=>{
    await section.getByLabel('What was confirmed').selectOption(status);
    await section.getByLabel('Confirmed on (your time zone)').fill(at);
    await section.getByLabel('Who confirmed it').selectOption(source);
    await section.getByLabel('How it was confirmed').selectOption(channel);
    await section.getByLabel('It covers').selectOption(scope);
    await section.getByLabel('Evidence reference').fill(evidence);
   };
   await fill({status:'available',at:'2025-03-10T09:30',source:'owner',channel:'phone',scope:'property',evidence:EVIDENCE});
   await record(201);
   await section.getByRole('status').filter({hasText:"Confirmation recorded. The listing's own status was not changed."}).waitFor();
   await says(fact('Confirmed availability'),'editor',['Available · 10 Mar 2025',`Owner by phone · recorded by ${ADMIN} · Whole property`]);
   await says(fact('Published status'),'editor',['For sale']);
   await section.getByRole('heading',{name:'Confirmation history (1)'}).waitFor();
   await section.locator('.confirmations li').filter({hasText:`Evidence: ${EVIDENCE}`}).waitFor();
   assert.equal(await section.getByLabel('Evidence reference').inputValue(),'','the form starts again');
   assert.deepEqual(listed(),before,'recording a confirmation leaves the listing as it was');
   await fits('editor, confirmed');
   if(shots)await section.screenshot({path:join(shots,`est16-confirmed-${width}.png`)});

   // The match card now says Confirmed, with when, who and how; the decision is still nobody's.
   await matches();
   await says(state(card(),'Availability'),'card',['Confirmed · 10 Mar 2025',`Owner by phone · recorded by ${ADMIN} · Listed as For sale`]);
   await says(state(card(),'Decision'),'card',['Not decided']);
   assert.equal((await text(card())).includes('E2E-EVIDENCE'),false,'the evidence text stays with the property');
   await fits('Matches, confirmed');
   if(shots)await page.screenshot({path:join(shots,`est16-card-confirmed-${width}.png`),fullPage:true});

   // Later the agency writes that the sale is no longer available: added to the history, the listing untouched.
   await page.goto(base+`admin/#/p/${lid}`);
   await section.getByRole('heading',{name:'Confirmation history (1)'}).waitFor();
   await fill({status:'unavailable',at:'2025-06-01T15:00',source:'agency',channel:'email',scope:'operation',evidence:`Email E2E-EVIDENCE ${width}`});
   await record(201);
   await says(fact('Confirmed availability'),'editor',['Not available · 1 Jun 2025',`Agency by email · recorded by ${ADMIN} · Only its sale`]);
   await section.getByRole('heading',{name:'Confirmation history (2)'}).waitFor();
   assert.equal(await section.locator('.confirmations li').count(),2);
   await says(section.locator('.confirmations li').first(),'history',['Not available · 1 Jun 2025']);
   await says(section.locator('.confirmations li').nth(1),'history',['Available · 10 Mar 2025']);
   await says(fact('Published status'),'editor',['For sale']);
   assert.deepEqual(listed(),before,'a confirmed unavailability archives and unpublishes nothing');
   assert.deepEqual(found(),[{status:'found'}],'and removes no match');
   await fits('editor, not available');
   if(shots)await section.screenshot({path:join(shots,`est16-unavailable-${width}.png`)});

   await matches();
   await says(state(card(),'Availability'),'card',['Confirmed not available · 1 Jun 2025',`Agency by email · recorded by ${ADMIN} · Listed as For sale`]);
   await fits('Matches, not available');
   if(shots)await page.screenshot({path:join(shots,`est16-card-unavailable-${width}.png`),fullPage:true});

   // The Review queue reads the same fact.
   await page.goto(base+'admin/#/review');
   const queued=page.locator('.review .match');
   await queued.getByRole('link',{name:home,exact:true}).waitFor();
   await says(state(queued,'Availability'),'review',['Confirmed not available · 1 Jun 2025']);
   await fits('Review');

   assert.deepEqual(d1(`SELECT status,operation,source,channel,recorded_by FROM availability_confirmations WHERE listing_id='${lid}' ORDER BY id`),
    [{status:'available',operation:null,source:'owner',channel:'phone',recorded_by:ADMIN},
     {status:'unavailable',operation:'sale',source:'agency',channel:'email',recorded_by:ADMIN}]);
   assert.deepEqual(d1(`SELECT COUNT(*) AS n FROM events WHERE data LIKE '%E2E-EVIDENCE%'`),[{n:0}],'no event carries the evidence text');
   await page.close();
  }
  assert.deepEqual(errors,[]);
  console.log('EST-16 E2E passed: 1280/390, published status, confirmed availability and provenance shown apart; a refused empty form, a confirmation by keyboard, a later unavailability added to the history, the listing and its matches untouched, match card and Review.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
