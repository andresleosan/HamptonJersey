// Isolated local fixtures only: E2E_PRODUCTION_READONLY=0 E2E_SCRIPT=tests/age06-responses.e2e.cjs npm run test:e2e:isolated
const assert=require('node:assert/strict');
const {readFileSync,mkdirSync}=require('node:fs');
const {join,dirname}=require('node:path');
const {parseEnv}=require('node:util');
const {execFileSync}=require('node:child_process');
const {randomUUID}=require('node:crypto');
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
   console.log('AGE06 width',width);
   const home=i=>`AGE06 ${width} home ${i}`,lid=i=>`HE-H${width}${i}`,agency=`AGE06 Agency ${width}`;
   d1("UPDATE listings SET matchable=0;DELETE FROM matches;"+[1,2].map(i=>{
    const row={id:lid(i),title:home(i),use:'residential',operation:'sale',availability:'for_sale',matchable:1,sale_price:900000,currency:'GBP',
     country:'Jersey',location:'St Helier',bedrooms:3,bathrooms:2,published:0,created_at:'2026-11-09T10:00:00.000Z',updated_at:'2026-11-09T10:00:00.000Z',
     updated_by:'fixture',...extractFeatures({description:'Parking for two cars'}),parish:'St Helier'};
    return `INSERT INTO listings(${Object.keys(row)}) VALUES(${Object.values(row).map(value)});`;
   }).join(''));
   const post=async(path,data,expected=200,method='post')=>{const r=await ctx.request[method](base+'api'+path,{headers:{origin},data});
    assert.equal(r.status(),expected,await r.text());return r.json();};
   const advertiser=(await post('/admin/advertisers',{name:agency,kind:'agency',channels:[],source_ids:[],listing_ids:[lid(1),lid(2)],commission:'',
    photo_permission:'',contacts:[{name:'Agency Desk',email:`desk-${width}@agency.example.test`,phones:[{label:'Office',number:'01534 000000'}]}]},201)).advertiser.id;
   const ids=[];
   for(const name of ['Ana','Ben'])ids.push((await post('/admin/applicants',{name:`AGE06 ${name} ${width}`,email:`age06-${name}-${width}@example.test`,
    operation:'buy',source:'phone',budget_max:1000000,parking_spaces:2,pets:[{kind:'none'}],household_adults:2,household_children:1,
    requirement_priorities:{version:1,values:{budget:'must',parking:'must'},unknown:[]}},201)).id);
   const [ana,ben]=ids;
   const matchOf=(a,i)=>d1(`SELECT id FROM matches WHERE applicant_id=${a} AND listing_id='${lid(i)}'`)[0].id;
   // Both shortlist home 1 and share one enquiry, sent by a person; Ben also shortlists home 2, whose enquiry is never sent.
   for(const [a,i] of [[ana,1],[ben,1],[ben,2]])await post(`/admin/matches/${matchOf(a,i)}`,{status:'shortlisted',from:'found'},200,'put');
   for(const [a,i,status] of [[ana,1,201],[ben,1,200],[ben,2,201]])
    await post(`/admin/matches/${matchOf(a,i)}/consultation`,{operation_id:randomUUID(),kind:'general',advertiser_id:advertiser},status);
   const enquiry=i=>d1(`SELECT id,status,response_outcome,(SELECT COUNT(*) FROM consultation_matches m WHERE m.consultation_id=c.id) AS matches
    FROM consultations c WHERE listing_id='${lid(i)}' ORDER BY id`);
   const first=enquiry(1)[0];
   await post(`/admin/consultations/${first.id}/manual-send`,{operation_id:randomUUID(),revision:1,sent_at:new Date().toISOString(),via:'email',
    evidence_ref:`Sent items E2E-EVIDENCE ${width}`});
   const confirmations=()=>d1(`SELECT status,source,channel FROM availability_confirmations WHERE listing_id='${lid(1)}'`);
   const tasks=i=>d1(`SELECT task_key,resolved_at IS NOT NULL AS done FROM notifications WHERE task_key LIKE 'consultation:%' AND target_id='${lid(i)}' ORDER BY id`);

   const page=await ctx.newPage();page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
   page.setDefaultTimeout(15000);
   await page.setViewportSize({width,height:900});
   const fits=async where=>assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth+1),`no sideways scroll: ${where} at ${width}`);
   const shot=async name=>{if(shots)await page.screenshot({path:join(shots,`age06-${name}-${width}.png`),fullPage:true});};
   const text=async where=>(await where.innerText()).replace(/\s+/g,' ').trim();
   // Polled to its final text, because lists, cards and panels reload after every action.
   const says=async(where,label,expected)=>{
    const ok=async()=>{if(await where.count()!==1)return false;const t=await text(where);return t.startsWith(expected[0])&&expected.every(part=>t.includes(part));};
    for(let i=0;i<80&&!(await ok());i++)await page.waitForTimeout(100);
    assert.ok(await ok(),`${label}: "${await where.count()===1?await text(where):'(not one)'}" should start with "${expected[0]}" and include ${JSON.stringify(expected.slice(1))}`);
   };
   const group=status=>page.locator('.match-group').filter({has:page.locator(`#group-${status}`)});
   const card=i=>group('shortlisted').locator('article.match').filter({has:page.getByRole('link',{name:home(i),exact:true})});
   const state=(where,label)=>where.locator('dl.match-states > div').filter({has:page.locator('dt',{hasText:label})}).locator('dd');
   const settled=async n=>{
    for(let i=0;i<80&&!(await group('shortlisted').getAttribute('aria-busy')==='false'&&await group('shortlisted').locator('article.match').count()===n);i++)await page.waitForTimeout(100);
    assert.equal(await group('shortlisted').locator('article.match').count(),n,'shortlisted matches');
   };

   // Ana's card: the enquiry was sent; its panel asks for the answer, and says what is missing first.
   await page.goto(base+`admin/#/applicants/${ana}/matches`);
   await settled(1);
   const mine=card(1);
   await says(state(mine,'Enquiry'),'sent card',['Sent manually · Availability enquiry']);
   await mine.getByRole('button',{name:`View enquiry for ${home(1)}`,exact:true}).click();
   const form=mine.getByRole('form',{name:/^Record the answer to enquiry \d+$/});
   await form.getByRole('button',{name:'Record answer'}).focus();
   await page.keyboard.press('Enter');
   await form.getByText('Choose what they answered',{exact:true}).waitFor();
   await form.getByText('Say who answered, in 120 characters or fewer',{exact:true}).waitFor();
   assert.equal(enquiry(1)[0].status,'sent');
   await fits('answer errors');await shot('errors');
   // An automatic reply: recorded, still waiting, nothing confirmed.
   await form.getByLabel('What they answered').selectOption('no_answer');
   await form.getByLabel('How they answered').selectOption('email');
   await form.getByLabel('Who answered').fill('Auto-reply');
   await form.getByLabel('Evidence reference').fill(`Inbox auto-reply E2E-EVIDENCE ${width}`);
   await form.getByRole('button',{name:'Record answer'}).click();
   await says(state(mine,'Enquiry'),'waiting card',['Awaiting a useful answer · Availability enquiry','No useful answer']);
   assert.deepEqual([enquiry(1)[0].status,enquiry(1)[0].response_outcome],['awaiting_response','no_answer']);
   assert.deepEqual(confirmations(),[]);
   // The call that confirms it, with what the agency said about Ana's household only.
   await mine.getByRole('button',{name:`View enquiry for ${home(1)}`,exact:true}).waitFor();
   if(!(await form.count()))await mine.getByRole('button',{name:`View enquiry for ${home(1)}`,exact:true}).click();
   await says(form.locator('xpath=..').locator('p').filter({hasText:/^Answer:/}),'waiting panel',['Answer: No useful answer','from Auto-reply']);
   await form.getByLabel('What they answered').selectOption('available');
   await form.getByLabel('It covers').selectOption('property');
   await form.getByLabel('How they answered').selectOption('phone');
   await form.getByLabel('Who answered').fill('Lettings desk');
   await form.getByLabel('Evidence reference').fill(`Call log E2E-EVIDENCE ${width}`);
   await form.getByLabel('Said about this search only (optional)').fill('Seller happy to include the garden furniture');
   await fits('answer form');await shot('answer');
   await form.getByRole('button',{name:'Record answer'}).click();
   await says(state(mine,'Enquiry'),'answered card',['Answered · Availability enquiry','Available','Said about this search only: Seller happy to include the garden furniture']);
   await says(state(mine,'Availability'),'confirmed card',['Confirmed']);
   assert.deepEqual(confirmations(),[{status:'available',source:'agency',channel:'phone'}]);
   assert.deepEqual([enquiry(1)[0].status,enquiry(1)[0].matches],['answered',2]);
   assert.ok(tasks(1).every(t=>t.done),'no task of the enquiry stays open');
   await fits('answered card');await shot('answered');

   // Ben's card says the same answer, without Ana's note; a new approval would start another enquiry.
   await page.goto(base+`admin/#/applicants/${ben}/matches`);
   await settled(2);
   await says(state(card(1),'Enquiry'),"Ben's card",['Answered · Availability enquiry','Available']);
   assert.ok(!(await text(card(1))).includes('garden furniture'),"never on another household's card");
   await card(1).getByRole('button',{name:`Prepare enquiry for ${home(1)}`,exact:true}).waitFor();

   // The property shows the answer and its provenance, nothing about any household.
   await page.goto(base+`admin/#/p/${lid(1)}`);
   const section=page.locator('#s-enquiries');
   await section.getByRole('heading',{name:'Enquiries (internal)'}).waitFor();
   await section.scrollIntoViewIfNeeded();
   await says(section.locator('div.enquiry > p').first(),'property panel',['Availability enquiry Answered']);
   await says(section.locator('div.enquiry p').filter({hasText:/^Answer: Available/}),'property answer',['Answer: Available','by phone · from Lettings desk','recorded by '+ADMIN,`Call log E2E-EVIDENCE ${width}`]);
   const whole=await text(section);
   for(const secret of ['garden furniture','AGE06 Ana','AGE06 Ben','age06-'])assert.ok(!whole.includes(secret),`the property's enquiry shows no ${secret}`);
   await fits('property');await shot('property');

   // Home 2's enquiry, never sent: once Ben's match is back in Found nothing counts for it, and it can be cancelled.
   await post(`/admin/matches/${matchOf(ben,2)}`,{status:'found',from:'shortlisted'},200,'put');
   await page.goto(base+`admin/#/p/${lid(2)}`);
   const other=page.locator('#s-enquiries');
   await other.getByRole('heading',{name:'Enquiries (internal)'}).waitFor();
   await other.scrollIntoViewIfNeeded();
   await other.getByRole('button',{name:'Cancel enquiry'}).click();
   await other.getByText('Enquiry cancelled.',{exact:true}).waitFor();
   await says(other.locator('div.enquiry > p').first(),'cancelled panel',['Availability enquiry Cancelled']);
   assert.equal(enquiry(2)[0].status,'cancelled');
   assert.ok(tasks(2).every(t=>t.done),'its Inbox task is closed');
   await fits('cancelled');await shot('cancelled');
   assert.deepEqual(d1('SELECT COUNT(*) AS n FROM outbound'),[{n:0}],'nothing is sent');
   await page.close();
  }
  assert.deepEqual(errors,[]);
  console.log('AGE-06 E2E passed: 1280/390, answer errors by keyboard, automatic reply keeps it waiting, a call confirms availability for every match from the agency, note kept on one household, property shows the answer without clients, enquiry without matches cancelled with its task.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
