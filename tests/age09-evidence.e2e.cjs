// Isolated local fixtures only: E2E_PRODUCTION_READONLY=0 E2E_SCRIPT=tests/age09-evidence.e2e.cjs npm run test:e2e:isolated
// AGE-09: an enquiry's evidence on the property's Enquiries card: what was shared and when, the general check apart from
// the one search whose household size the text carried, the matches it served with their approvals, the answer, and
// an enquiry never sent that shared nothing. Reads only; nothing is sent.
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
   console.log('AGE09 width',width);
   const home=i=>`AGE09 ${width} home ${i}`,lid=i=>`HE-J${width}${i}`;
   d1("UPDATE listings SET matchable=0;DELETE FROM matches;"+[1,2].map(i=>{
    const row={id:lid(i),title:home(i),use:'residential',operation:'sale',availability:'for_sale',matchable:1,sale_price:900000,currency:'GBP',
     country:'Jersey',location:'St Helier',bedrooms:3,bathrooms:2,published:0,created_at:'2026-11-09T10:00:00.000Z',updated_at:'2026-11-09T10:00:00.000Z',
     updated_by:'fixture',...extractFeatures({description:'Parking for two cars'}),parish:'St Helier'};
    return `INSERT INTO listings(${Object.keys(row)}) VALUES(${Object.values(row).map(value)});`;
   }).join(''));
   const post=async(path,data,expected=200,method='post')=>{const r=await ctx.request[method](base+'api'+path,{headers:{origin},data});
    assert.equal(r.status(),expected,await r.text());return r.json();};
   const agency=(await post('/admin/advertisers',{name:`AGE09 Agency ${width}`,kind:'agency',channels:[],source_ids:[],listing_ids:[lid(1),lid(2)],
    commission:'Fixture 1.5% E2E-COMMISSION',photo_permission:'',contacts:[{name:'Agency Desk',email:`desk-${width}@agency.example.test`,phones:[]}]},201)).advertiser.id;
   const applicant=name=>post('/admin/applicants',{name,email:`${name.toLowerCase().replaceAll(' ','-')}@example.test`,operation:'buy',source:'phone',
    budget_max:1000000,parking_spaces:2,pets:[{kind:'none'}],household_adults:2,household_children:1,
    requirement_priorities:{version:1,values:{budget:'must',parking:'must'},unknown:[]}},201).then(r=>r.id);
   const ana=await applicant(`AGE09 Ana ${width}`),ben=await applicant(`AGE09 Ben ${width}`);
   const matchOf=(a,i)=>d1(`SELECT id FROM matches WHERE applicant_id=${a} AND listing_id='${lid(i)}'`)[0].id;
   for(const a of [ana,ben])for(const i of [1,2])await post(`/admin/matches/${matchOf(a,i)}`,{status:'shortlisted',from:'found'},200,'put');
   // Home 1: Ana's household size stated, Ben joins, sent by hand and answered with no useful answer. Home 2: prepared, never sent.
   await post(`/admin/matches/${matchOf(ana,1)}/consultation`,{operation_id:randomUUID(),kind:'general',advertiser_id:agency,include_occupants:true},201);
   await post(`/admin/matches/${matchOf(ben,1)}/consultation`,{operation_id:randomUUID(),kind:'general',advertiser_id:agency});
   await post(`/admin/matches/${matchOf(ana,2)}/consultation`,{operation_id:randomUUID(),kind:'general',advertiser_id:agency},201);
   const id=d1(`SELECT id FROM consultations WHERE listing_id='${lid(1)}'`)[0].id;
   await post(`/admin/consultations/${id}/manual-send`,{operation_id:randomUUID(),revision:1,sent_at:new Date().toISOString(),via:'phone',
    evidence_ref:`Call log E2E-EVIDENCE ${width}`});
   await post(`/admin/consultations/${id}/response`,{operation_id:randomUUID(),revision:1,outcome:'no_answer',answered_at:new Date().toISOString(),
    via:'email',answered_by:'Auto-reply',evidence_ref:`Inbox E2E-REPLY ${width}`});

   const page=await ctx.newPage();page.on('pageerror',e=>errors.push(e.message));
   page.setDefaultTimeout(15000);
   await page.setViewportSize({width,height:900});
   const fits=async where=>assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth+1),`no sideways scroll: ${where} at ${width}`);
   const shot=async name=>{if(shots)await page.screenshot({path:join(shots,`age09-${name}-${width}.png`),fullPage:true});};
   const text=async where=>(await where.innerText()).replace(/\s+/g,' ').trim();
   const open=async listing=>{
    await page.goto(base+`admin/#/p/${listing}`);
    const section=page.locator('#s-enquiries');
    await section.getByRole('heading',{name:'Enquiries (internal)'}).waitFor();
    const toggle=section.getByRole('button',{name:'Evidence of what was shared'});
    await toggle.scrollIntoViewIfNeeded();
    // By keyboard: the button opens it and says so.
    await toggle.focus();await page.keyboard.press('Enter');
    await section.getByRole('button',{name:'Hide evidence'}).waitFor();
    assert.equal(await section.getByRole('button',{name:'Hide evidence'}).getAttribute('aria-expanded'),'true');
    const evidence=section.getByRole('region',{name:'Evidence of what was shared'});
    await evidence.getByRole('heading',{name:'Call'}).waitFor();
    return evidence;
   };

   const sent=await open(lid(1)),said=await text(sent);
   for(const part of ['facts only: it does not establish any commission or fee','by phone · recorded by admin@example.test, who sent it',
    `Evidence: Call log E2E-EVIDENCE ${width}`,'General check: asked about availability and viewing times. It names no client. 2 approved matches had joined it when it was sent.',
    `Search ${ana} (match ${matchOf(ana,1)}): the text carried its household size (3), with no name or contact.`,
    `Search ${ben} (match ${matchOf(ben,1)}) · approved by admin@example.test`,'· had joined when it was sent','Recorded as sent by the person who sent it',
    'No useful answer (automatic reply, unclear or no reply) · by email','from Auto-reply','No call was due.'])
    assert.ok(said.includes(part),`sent evidence at ${width} should include "${part}": ${said}`);
   for(const secret of ['AGE09 Ana','AGE09 Ben','E2E-COMMISSION','Agency Desk',`desk-${width}`,'age09-ana','age09-ben'])
    assert.ok(!said.includes(secret),`no ${secret} in the evidence`);
   assert.equal(await sent.getByRole('link',{name:`Search ${ana}`,exact:true}).first().getAttribute('href'),`#/applicants/${ana}/matches`);
   // The text that went out, as recorded: the household size it stated and no client.
   const copy=await sent.getByLabel('Text sent').inputValue();
   assert.ok(copy.includes('household of 3 people')&&!/AGE09 (Ana|Ben)|age09-|E2E-COMMISSION/.test(copy),copy);
   await fits('sent');await shot('sent');

   const unsent=await open(lid(2)),quiet=await text(unsent);
   assert.ok(quiet.includes('Nothing has been shared with the advertiser yet: no sending was recorded and no email was accepted. No client was presented.'),quiet);
   assert.ok(!quiet.includes('Text sent'),'no text was sent');
   await fits('unsent');await shot('unsent');
   assert.deepEqual(d1('SELECT COUNT(*) AS n FROM outbound'),[{n:0}],'nothing is sent');
   await page.close();
  }
  assert.deepEqual(errors,[]);
  console.log('AGE-09 E2E passed: 1280/390, keyboard opens the evidence, general check apart from the one household stated, matches served with approvals, answer, no names/contacts/commission, unsent enquiry shared nothing, nothing sent.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
