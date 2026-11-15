// Isolated local fixtures only: E2E_PRODUCTION_READONLY=0 E2E_SCRIPT=tests/age08-call-tasks.e2e.cjs npm run test:e2e:isolated
// AGE-08: an enquiry sent with no useful answer two working days on gets one Inbox task to call the advertiser; the
// property's Enquiries section lists every number in the directory; a useful answer closes the task. The fixture has
// no clock Worker, so the clock's pass (callPass) runs here once, on the same local D1, through Wrangler's platform proxy.
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
 const {extractFeatures}=await import('../server/listing-features.js'),{enquiries}=await import('../server/consultations.js');
 const {callPass}=enquiries((await import('../server/routes/matches.js')).ENQUIRY_GATES);
 const {getPlatformProxy}=await import('wrangler');
 // --persist-to keeps its state under v3; the proxy takes that folder itself.
 const proxy=await getPlatformProxy({configPath:'wrangler.toml',persist:{path:join(process.env.E2E_PERSIST,'v3')}});
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
   console.log('AGE08 width',width);
   const home=i=>`AGE08 ${width} home ${i}`,lid=i=>`HE-K${width}${i}`,agency=i=>`AGE08 Agency ${width} ${i}`;
   d1("UPDATE listings SET matchable=0;DELETE FROM matches;"+[1,2].map(i=>{
    const row={id:lid(i),title:home(i),use:'residential',operation:'sale',availability:'for_sale',matchable:1,sale_price:900000,currency:'GBP',
     country:'Jersey',location:'St Helier',bedrooms:3,bathrooms:2,published:0,created_at:'2026-11-09T10:00:00.000Z',updated_at:'2026-11-09T10:00:00.000Z',
     updated_by:'fixture',...extractFeatures({description:'Parking for two cars'}),parish:'St Helier'};
    return `INSERT INTO listings(${Object.keys(row)}) VALUES(${Object.values(row).map(value)});`;
   }).join(''));
   const post=async(path,data,expected=200,method='post')=>{const r=await ctx.request[method](base+'api'+path,{headers:{origin},data});
    assert.equal(r.status(),expected,await r.text());return r.json();};
   // Home 1's agency has three numbers over two contacts; home 2's has none.
   const contacts={1:[{name:'Agency Desk',email:`desk-${width}@agency.example.test`,phones:[{label:'Office',number:'01534 000000'},{label:'Mobile',number:'07700 900001'}]},
    {name:'Second Desk',email:'',phones:[{label:'Office',number:'01534 000002'}]}],2:[{name:'Mail Desk',email:`mail-${width}@agency.example.test`,phones:[]}]};
   const advertiser={};
   for(const i of [1,2])advertiser[i]=(await post('/admin/advertisers',{name:agency(i),kind:'agency',channels:[],source_ids:[],listing_ids:[lid(i)],commission:'',
    photo_permission:'',contacts:contacts[i]},201)).advertiser.id;
   const ana=(await post('/admin/applicants',{name:`AGE08 Ana ${width}`,email:`age08-ana-${width}@example.test`,operation:'buy',source:'phone',
    budget_max:1000000,parking_spaces:2,pets:[{kind:'none'}],household_adults:2,household_children:1,
    requirement_priorities:{version:1,values:{budget:'must',parking:'must'},unknown:[]}},201)).id;
   const matchOf=i=>d1(`SELECT id FROM matches WHERE applicant_id=${ana} AND listing_id='${lid(i)}'`)[0].id;
   const enquiry=i=>d1(`SELECT id,status FROM consultations WHERE listing_id='${lid(i)}' ORDER BY id`)[0];
   for(const i of [1,2]){
    await post(`/admin/matches/${matchOf(i)}`,{status:'shortlisted',from:'found'},200,'put');
    await post(`/admin/matches/${matchOf(i)}/consultation`,{operation_id:randomUUID(),kind:'general',advertiser_id:advertiser[i]},201);
    await post(`/admin/consultations/${enquiry(i).id}/manual-send`,{operation_id:randomUUID(),revision:1,sent_at:new Date().toISOString(),via:'email',
     evidence_ref:`Sent items E2E-EVIDENCE ${width}`});
   }
   const calls=i=>d1(`SELECT title,task_reason,resolved_at IS NOT NULL AS done FROM notifications WHERE task_key LIKE '%:call' AND target_id='${lid(i)}'`);
   // Just sent: the clock creates nothing yet.
   await callPass({...proxy.env,AGE08_CALL_TASKS_READY:'1'},new Date().toISOString());
   assert.deepEqual([...calls(1),...calls(2)],[],'nothing before it is due');
   // A fixture's shortcut: both were sent eight days ago, so the call is due; two ticks make one task each.
   const ago=new Date(Date.now()-8*864e5).toISOString();
   d1(`UPDATE consultations SET prepared_at='${ago}',sent_at='${ago}' WHERE listing_id IN ('${lid(1)}','${lid(2)}')`);
   for(let tick=0;tick<2;tick++)await callPass({...proxy.env,AGE08_CALL_TASKS_READY:'1'},new Date().toISOString());
   assert.deepEqual(calls(1),[{title:`Call ${agency(1)} about ${home(1)} (${lid(1)})`,task_reason:calls(1)[0]?.task_reason,done:0}]);
   assert.match(calls(1)[0].task_reason,/3 phone numbers/);
   assert.match(calls(2)[0].task_reason,/no phone number for/);
   for(const secret of ['01534','07700','Agency Desk','desk-'])assert.ok(!JSON.stringify([calls(1),calls(2)]).includes(secret),`the task copies no ${secret}`);

   const page=await ctx.newPage();page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
   page.setDefaultTimeout(15000);
   await page.setViewportSize({width,height:900});
   const fits=async where=>assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth+1),`no sideways scroll: ${where} at ${width}`);
   const shot=async name=>{if(shots)await page.screenshot({path:join(shots,`age08-${name}-${width}.png`),fullPage:true});};
   const text=async where=>(await where.innerText()).replace(/\s+/g,' ').trim();
   const says=async(where,label,expected)=>{
    const ok=async()=>{if(await where.count()!==1)return false;const t=await text(where);return t.startsWith(expected[0])&&expected.every(part=>t.includes(part));};
    for(let i=0;i<80&&!(await ok());i++)await page.waitForTimeout(100);
    assert.ok(await ok(),`${label}: "${await where.count()===1?await text(where):'(not one)'}" should start with "${expected[0]}" and include ${JSON.stringify(expected.slice(1))}`);
   };

   // The Inbox has the call; it leads to the property, where every number of the directory is.
   await page.goto(base+'admin/#/');
   const task=page.locator('.inbox-list li').filter({hasText:`Call ${agency(1)} about ${home(1)}`}).first();
   await task.waitFor();
   await task.getByRole('button').click();
   const notice=page.locator('article.inbox-detail');
   await notice.getByRole('heading',{name:`Call ${agency(1)} about ${home(1)} (${lid(1)})`}).waitFor();
   await notice.getByText(/has the 3 phone numbers of/).waitFor();
   await fits('Inbox');await shot('inbox');
   await notice.getByRole('link',{name:'Open property'}).click();
   await page.waitForURL(url=>url.hash===`#/p/${lid(1)}`);
   const section=page.locator('#s-enquiries');
   await section.getByRole('heading',{name:'Enquiries (internal)'}).waitFor();
   const due=section.getByRole('group',{name:/^Call about enquiry \d+$/});
   await due.scrollIntoViewIfNeeded();
   await says(due,'call block',['No useful answer two working days after it was sent','Agency Desk · Office 01534 000000','Agency Desk · Mobile 07700 900001',
    'Second Desk · Office 01534 000002']);
   assert.deepEqual(await due.getByRole('link').evaluateAll(a=>a.map(x=>x.getAttribute('href'))),['tel:01534000000','tel:07700900001','tel:01534000002']);
   await fits('call');await shot('call');
   // The call gets a useful answer: recorded, and the task closes by itself.
   const form=section.getByRole('form',{name:/^Record the answer to enquiry \d+$/});
   await form.getByLabel('What they answered').selectOption('available');
   await form.getByLabel('It covers').selectOption('property');
   await form.getByLabel('How they answered').selectOption('phone');
   await form.getByLabel('Who answered').fill('Lettings desk');
   await form.getByLabel('Evidence reference').fill(`Call log E2E-EVIDENCE ${width}`);
   await form.getByRole('button',{name:'Record answer'}).click();
   await says(section.locator('div.enquiry > p').first(),'answered panel',['Availability enquiry Answered']);
   for(let i=0;i<80&&await due.count();i++)await page.waitForTimeout(100);
   assert.equal(await due.count(),0,'no call once it is answered');
   assert.deepEqual([enquiry(1).status,calls(1)[0].done],['answered',1]);
   await fits('answered');await shot('answered');

   // Home 2: the directory has no number, and the property says so.
   await page.goto(base+`admin/#/p/${lid(2)}`);
   const other=page.locator('#s-enquiries').getByRole('group',{name:/^Call about enquiry \d+$/});
   await other.waitFor();await other.scrollIntoViewIfNeeded();
   await says(other,'no phone',['No useful answer two working days after it was sent','The directory has no phone number for them.']);
   await fits('no phone');await shot('no-phone');
   assert.deepEqual(d1('SELECT COUNT(*) AS n FROM outbound'),[{n:0}],'nothing is sent');
   await page.close();
  }
  assert.deepEqual(errors,[]);
  console.log('AGE-08 E2E passed: 1280/390, nothing before it is due, one call task per enquiry over two ticks without copying numbers, Inbox leads to the property with every number as a tel link, a useful answer closes the task, an advertiser with no number is named as such, nothing sent.');
 }finally{await browser.close();await proxy.dispose();}
})().catch(e=>{console.error(e);process.exitCode=1;});
