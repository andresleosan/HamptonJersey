// Isolated local fixtures only: E2E_PRODUCTION_READONLY=0 E2E_SCRIPT=tests/sap02-match-counts.e2e.cjs npm run test:e2e:isolated
// SAP-02 / SAP-03 / EST-04: the list counts found, confirmed and available homes and says In process while an enquiry
// waits for the agency; the record narrows its Matches to the same, with the same cards and decisions.
const assert=require('node:assert/strict');
const {readFileSync,mkdirSync}=require('node:fs');
const {join,dirname}=require('node:path');
const {parseEnv}=require('node:util');
const {randomUUID}=require('node:crypto');
const {execFileSync}=require('node:child_process');
const {chromium,webkit}=require(process.env.PW||'playwright-core');
(async()=>{
 assert.equal(process.env.HAMPTON_E2E_ISOLATED,'1');assert.equal(process.env.E2E_PRODUCTION_READONLY,'0');
 const vars=parseEnv(readFileSync(process.env.E2E_VARS,'utf8')),{signSession,COOKIE}=await import('../server/auth.js');
 const {extractFeatures}=await import('../server/listing-features.js');
 for(const k of ['SAP02_COUNTS_READY','EST16_AVAILABILITY_READY','AGE03_ENQUIRIES_READY'])assert.equal(vars[k],'1');
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
   console.log('SAP02 width',width);
   // Three homes for sale, proposed to both searches: home 1 confirmed available, home 2 confirmed available and
   // later not available (EST-15, on as in production: its Found matches go, the shortlisted stay), home 3 never confirmed.
   const home=i=>`SAP02 ${width} home ${i}`,lid=i=>`HE-S${width}${i}`,name=k=>`SAP02 ${k} ${width}`;
   d1("UPDATE listings SET matchable=0;DELETE FROM matches;"+[1,2,3].map(i=>{
    const row={id:lid(i),title:home(i),use:'residential',operation:'sale',availability:'for_sale',matchable:1,sale_price:900000,currency:'GBP',
     country:'Jersey',location:'St Helier',bedrooms:3,bathrooms:2,published:0,created_at:'2026-11-09T10:00:00.000Z',updated_at:'2026-11-09T10:00:00.000Z',
     updated_by:'fixture',...extractFeatures({description:'Parking for two cars'}),parish:'St Helier'};
    return `INSERT INTO listings(${Object.keys(row)}) VALUES(${Object.values(row).map(value)});`;
   }).join(''));
   const post=async(path,data,expected=200,method='post')=>{const r=await ctx.request[method](base+'api'+path,{headers:{origin},data});
    assert.equal(r.status(),expected,await r.text());return r.json();};
   const agency=(await post('/admin/advertisers',{name:`SAP02 Agency ${width}`,kind:'agency',channels:[],source_ids:[],listing_ids:[1,2,3].map(lid),commission:'',
    photo_permission:'',contacts:[{name:'Agency Desk',email:`desk-${width}@agency.example.test`,phones:[{label:'Office',number:'01534 000000'}]}]},201)).advertiser.id;
   const id={};
   for(const k of ['Counts','Plain'])id[k]=(await post('/admin/applicants',{name:name(k),email:`sap02-${k}-${width}@example.test`,operation:'buy',source:'phone',
    budget_max:1000000,parking_spaces:2,pets:[{kind:'none'}],requirement_priorities:{version:1,values:{budget:'must',parking:'must'},unknown:[]}},201)).id;
   const matchOf=(k,i)=>d1(`SELECT id FROM matches WHERE applicant_id=${id[k]} AND listing_id='${lid(i)}'`)[0].id;
   const statuses=k=>d1(`SELECT listing_id,status FROM matches WHERE applicant_id=${id[k]} ORDER BY listing_id`).map(m=>m.status);
   const confirm=(i,status,confirmed_at)=>post(`/admin/listings/${lid(i)}/availability`,{status,confirmed_at,source:'agency',channel:'phone',
    evidence_ref:'Call note FIXTURE-EVIDENCE',scope:'property',...(status==='unavailable'&&{reason:'let'})},201);
   // Counts shortlists homes 1 and 2 and asks the agency about home 1; Plain decides nothing.
   for(const i of [1,2])await post(`/admin/matches/${matchOf('Counts',i)}`,{status:'shortlisted',from:'found'},200,'put');
   await confirm(1,'available','2026-11-10T09:30:00.000Z');
   await confirm(2,'available','2026-11-10T09:30:00.000Z');
   await confirm(2,'unavailable','2026-11-11T09:30:00.000Z');
   await post(`/admin/matches/${matchOf('Counts',1)}/consultation`,{operation_id:randomUUID(),kind:'general',advertiser_id:agency},201);
   assert.deepEqual([statuses('Counts'),statuses('Plain')],[['shortlisted','shortlisted','found'],['found','found']]);

   const page=await ctx.newPage();page.on('pageerror',e=>errors.push(e.message));
   page.setDefaultTimeout(15000);
   await page.setViewportSize({width,height:900});
   const fits=async where=>assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth+1),`no sideways scroll: ${where} at ${width}`);
   const shot=async label=>{if(shots)await page.screenshot({path:join(shots,`sap02-${label}-${width}.png`),fullPage:true});};
   // Polled to its final state: the list and the groups reload after every filter and review.
   const until=async(label,ok)=>{for(let i=0;i<100&&!(await ok());i++)await page.waitForTimeout(100);assert.ok(await ok(),label);};

   // The list: found, confirmed and available per search, what was confirmed not available apart, and In process.
   await page.goto(base+'admin/#/applicants');
   const row=k=>page.locator('table.applicants tbody tr').filter({has:page.getByRole('link',{name:name(k),exact:true})});
   const cell=(k,label)=>row(k).locator(`td[data-label="${label}"]`);
   await cell('Counts','Matches').getByRole('link',{name:`3 found · 1 confirmed · 1 available for ${name('Counts')}`,exact:true}).waitFor();
   await cell('Counts','Matches').getByText('1 confirmed not available',{exact:true}).waitFor();
   await cell('Plain','Matches').getByRole('link',{name:`2 found · 1 confirmed · 0 available for ${name('Plain')}`,exact:true}).waitFor();
   assert.equal(await cell('Plain','Matches').getByText(/not available/).count(),0);
   const labels=async k=>(await cell(k,'Work labels').locator('.badge').allInnerTexts()).map(t=>t.trim());
   assert.deepEqual(await labels('Counts'),['Waiting for review','Shortlisted','In process']);
   assert.deepEqual(await labels('Plain'),['Waiting for review'],'a confirmed home nobody shortlisted or asked about is neither');
   assert.equal(await page.getByText(/shortlisted for SAP02/).count(),0,'the shortlist is a work label, not a count of confirmed homes');
   await fits('Applicants');await shot('applicants');
   const work=page.getByLabel('Work label');
   assert.deepEqual(await work.locator('option').allInnerTexts(),['All','New properties found','Waiting for review','Shortlisted','In process','No matches awaiting review or shortlisted']);
   await work.selectOption('in_process');
   await until('In process filters to the search with an enquiry waiting',async()=>await row('Counts').count()===1&&await row('Plain').count()===0);
   await work.selectOption('');
   await row('Plain').waitFor();

   // The record: the same cards in their groups, narrowed by what each one says.
   const group=status=>page.locator('.match-group').filter({has:page.locator(`#group-${status}`)});
   const cards=status=>group(status).locator('article.match');
   const titles=async status=>(await cards(status).locator('h3').allInnerTexts()).map(t=>t.trim());
   const settled=async(found,shortlisted)=>{
    const now=async()=>[await group('found').getAttribute('aria-busy'),await group('shortlisted').getAttribute('aria-busy'),await titles('found'),await titles('shortlisted')];
    await until(`found ${JSON.stringify(found)}, shortlisted ${JSON.stringify(shortlisted)}; got ${JSON.stringify(await now())}`,
     async()=>JSON.stringify(await now())===JSON.stringify(['false','false',found,shortlisted]));
   };
   const show=page.getByRole('group',{name:'Show matches'}),filter=label=>show.getByRole('button',{name:label,exact:true});
   const pick=async label=>{await filter(label).click();await until(`${label} is pressed`,async()=>await filter(label).getAttribute('aria-pressed')==='true');};
   const state=(where,label)=>where.locator('dl.match-states > div').filter({has:page.locator('dt',{hasText:label})}).locator('dd');
   await page.goto(base+`admin/#/applicants/${id.Counts}/matches`);
   await settled([home(3)],[home(1),home(2)]);
   for(const label of ['All','Confirmed 1','Available 1','Confirmed not available 1','Waiting for agency 1'])await filter(label).waitFor();
   assert.equal(await filter('All').getAttribute('aria-pressed'),'true');
   await pick('Confirmed 1');
   await settled([],[home(1)]);
   await group('found').getByText('Nothing confirmed in Found.',{exact:true}).waitFor();
   assert.equal(await page.locator('article.match').count(),1,'a card is shown once, in its own group');
   await state(cards('shortlisted'),'Availability').getByText('Confirmed',{exact:true}).waitFor();
   await fits('Record, Confirmed');await shot('record-confirmed');
   await pick('Available 1');
   await settled([],[home(1)]);
   await pick('Confirmed not available 1');
   await settled([],[home(2)]);
   await state(cards('shortlisted'),'Availability').getByText('Confirmed not available',{exact:true}).waitFor();
   await pick('Waiting for agency 1');
   await settled([],[home(1)]);
   await pick('All');
   await settled([home(3)],[home(1),home(2)]);
   assert.equal(await page.locator('article.match').count(),3);
   await fits('Record, All');await shot('record-all');
   assert.deepEqual(statuses('Counts'),['shortlisted','shortlisted','found'],'filtering decides nothing');

   // Plain: confirmed is not available until someone shortlists it; a review under a filter moves the same card.
   await page.goto(base+`admin/#/applicants/${id.Plain}/matches`);
   await settled([home(1),home(3)],[]);
   await filter('Available 0').waitFor();
   await pick('Confirmed 1');
   await settled([home(1)],[]);
   await cards('found').getByRole('button',{name:`Shortlist ${home(1)}`,exact:true}).click();
   await settled([],[home(1)]);
   await filter('Available 1').waitFor();
   assert.deepEqual(statuses('Plain'),['shortlisted','found']);
   await page.goto(base+'admin/#/applicants');
   await cell('Plain','Matches').getByRole('link',{name:`2 found · 1 confirmed · 1 available for ${name('Plain')}`,exact:true}).waitFor();
   await page.close();
  }
  assert.deepEqual(errors,[]);
  console.log('SAP-02/SAP-03/EST-04 E2E passed: 1280/390, the list counts found, confirmed and available with not available apart and In process only while an enquiry waits; the record narrows the same cards without duplicates or changed decisions.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
