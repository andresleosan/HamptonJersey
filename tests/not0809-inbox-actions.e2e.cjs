// Isolated local fixtures only: E2E_PRODUCTION_READONLY=0 E2E_SCRIPT=tests/not0809-inbox-actions.e2e.cjs npm run test:e2e:isolated
// NOT-08/NOT-09 (NOT0809_INBOX_READY): AGE-08's call task shows under Agency replies; Call opens the property's enquiry in
// the notice with every number and AGE-06's answer form, and a useful answer closes it. Snooze moves a task to the Feed
// until tomorrow and Wake brings it back; Approve confirms AUT-19's proposed criteria, before and after, from the notice.
// The fixture has no clock Worker, so AGE-08's pass (callPass) runs here on the same local D1 through the platform proxy.
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
  // Seeded notices are not part of this check: close them so each width starts from an empty Needs action.
  d1("UPDATE notifications SET resolved_at='2026-11-15T08:00:00.000Z',resolved_by='fixture' WHERE resolved_at IS NULL");
  for(const width of [1280,390]){
   console.log('NOT0809 width',width);
   const home=`NOT0809 ${width} home`,lid=`HE-N${width}`,agency=`NOT0809 Agency ${width}`;
   const row={id:lid,title:home,use:'residential',operation:'sale',availability:'for_sale',matchable:1,sale_price:900000,currency:'GBP',
    country:'Jersey',location:'St Helier',bedrooms:3,bathrooms:2,published:0,created_at:'2026-11-09T10:00:00.000Z',updated_at:'2026-11-09T10:00:00.000Z',
    updated_by:'fixture',...extractFeatures({description:'Parking for two cars'}),parish:'St Helier'};
   d1(`UPDATE listings SET matchable=0;DELETE FROM matches;INSERT INTO listings(${Object.keys(row)}) VALUES(${Object.values(row).map(value)});`);
   const post=async(path,data,expected=200,method='post')=>{const r=await ctx.request[method](base+'api'+path,{headers:{origin},data});
    assert.equal(r.status(),expected,await r.text());return r.json();};
   const advertiser=(await post('/admin/advertisers',{name:agency,kind:'agency',channels:[],source_ids:[],listing_ids:[lid],commission:'',photo_permission:'',
    contacts:[{name:'Agency Desk',email:`desk-${width}@agency.example.test`,phones:[{label:'Office',number:'01534 000000'},{label:'Mobile',number:'07700 900001'}]}]},201)).advertiser.id;
   const ana=(await post('/admin/applicants',{name:`NOT0809 Ana ${width}`,email:`not0809-ana-${width}@example.test`,operation:'buy',source:'phone',
    budget_max:1000000,parking_spaces:2,pets:[{kind:'none'}],household_adults:2,household_children:1,
    requirement_priorities:{version:1,values:{budget:'must',parking:'must'},unknown:[]}},201)).id;
   const match=d1(`SELECT id FROM matches WHERE applicant_id=${ana} AND listing_id='${lid}'`)[0].id;
   await post(`/admin/matches/${match}`,{status:'shortlisted',from:'found'},200,'put');
   await post(`/admin/matches/${match}/consultation`,{operation_id:randomUUID(),kind:'general',advertiser_id:advertiser},201);
   const enquiry=()=>d1(`SELECT id,status FROM consultations WHERE listing_id='${lid}'`)[0];
   await post(`/admin/consultations/${enquiry().id}/manual-send`,{operation_id:randomUUID(),revision:1,sent_at:new Date().toISOString(),via:'email',
    evidence_ref:`Sent items E2E-EVIDENCE ${width}`});
   const ago=new Date(Date.now()-8*864e5).toISOString();
   d1(`UPDATE consultations SET prepared_at='${ago}',sent_at='${ago}' WHERE listing_id='${lid}'`);
   await callPass({...proxy.env,AGE08_CALL_TASKS_READY:'1'},new Date().toISOString());
   const call=`Call ${agency} about ${home} (${lid})`;
   assert.equal(d1(`SELECT COUNT(*) AS n FROM notifications WHERE title='${call}' AND resolved_at IS NULL`)[0].n,1);
   // AUT-19: a budget change dictated after a call waits as a proposal, with its Inbox task.
   await post(`/admin/applicants/${ana}/criteria-proposals`,{changes:{budget_max:1200000},note:'Phone call'},201);

   const page=await ctx.newPage();page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
   page.setDefaultTimeout(15000);
   await page.setViewportSize({width,height:900});
   const fits=async where=>assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth+1),`no sideways scroll: ${where} at ${width}`);
   const shot=async name=>{if(shots)await page.screenshot({path:join(shots,`not0809-${name}-${width}.png`),fullPage:true});};
   const categories=page.getByRole('group',{name:'Category',exact:true}),boxes=page.getByRole('group',{name:'Notices',exact:true});
   const notice=page.locator('article.inbox-detail'),status=text=>page.getByRole('status').filter({hasText:text}).first().waitFor();
   const pick=async title=>{await page.locator('.inbox-list li').filter({hasText:title}).first().getByRole('button').click();
    await notice.getByRole('heading',{name:title,exact:true}).waitFor();};

   // NOT-08: the call task is an agency reply, counted there and not under Tasks.
   await page.goto(base+'admin/#/');
   const replies=categories.getByRole('button',{name:/^Agency replies/});
   await replies.waitFor();
   const counted=async()=>(await replies.innerText()).replace(/\D/g,'');
   for(let i=0;i<80&&!(await counted());i++)await page.waitForTimeout(100);
   assert.equal(await counted(),'1');
   await replies.click();assert.equal(await replies.getAttribute('aria-pressed'),'true');
   await pick(call);
   // NOT-09 · Call: the enquiry opens in the notice, with every number as a tel link and the answer form.
   const callButton=notice.getByRole('button',{name:'Call',exact:true});
   await callButton.click();assert.equal(await callButton.getAttribute('aria-expanded'),'true');
   const due=notice.getByRole('group',{name:/^Call about enquiry \d+$/});
   await due.waitFor();
   assert.deepEqual(await due.getByRole('link').evaluateAll(a=>a.map(x=>x.getAttribute('href'))),['tel:01534000000','tel:07700900001']);
   await fits('call');await shot('call');
   const form=notice.getByRole('form',{name:/^Record the answer to enquiry \d+$/});
   await form.getByLabel('What they answered').selectOption('available');
   await form.getByLabel('It covers').selectOption('property');
   await form.getByLabel('How they answered').selectOption('phone');
   await form.getByLabel('Who answered').fill('Lettings desk');
   await form.getByLabel('Evidence reference').fill(`Call log E2E-EVIDENCE ${width}`);
   await form.getByRole('button',{name:'Record answer'}).click();
   await status('Answer recorded. This task is closed.');
   await page.getByText('No agency reply tasks need action.',{exact:true}).waitFor();
   assert.deepEqual([enquiry().status,d1(`SELECT resolved_at IS NOT NULL AS done FROM notifications WHERE title='${call}'`)[0].done],['answered',1]);

   // NOT-09 · Snooze, by keyboard: the proposal's task leaves Needs action for the Feed until tomorrow, then Wake.
   const proposal='Confirm proposed criteria changes';
   await categories.getByRole('button',{name:/^Tasks/}).click();
   await pick(proposal);
   const snooze=notice.getByRole('button',{name:'Snooze until tomorrow',exact:true});
   await snooze.focus();await page.keyboard.press('Enter');
   await status('Snoozed until tomorrow. It waits in the Feed until then.');
   assert.equal(await page.locator('.inbox-list li').filter({hasText:proposal}).count(),0,'not in Needs action while snoozed');
   assert.equal(d1(`SELECT COUNT(*) AS n FROM notification_task_history h JOIN notifications n ON n.id=h.task_id WHERE n.title='${proposal}'
    AND n.resolved_at IS NULL AND h.action='snooze'`)[0].n,1);
   await boxes.getByRole('button',{name:'Feed',exact:true}).click();
   const snoozed=page.locator('.inbox-list li').filter({hasText:proposal}).first();
   await snoozed.getByText(/^Snoozed until /).waitFor();
   await pick(proposal);
   await notice.getByText(/^Snoozed until /).waitFor();
   await fits('snoozed');await shot('snoozed');
   await notice.getByRole('button',{name:'Wake now',exact:true}).click();
   await status('Back in Needs action.');

   // NOT-09 · Approve: before and after from the notice; the criteria are saved and the task closes at its source.
   await boxes.getByRole('button',{name:/^Needs action/}).click();
   await categories.getByRole('button',{name:/^Tasks/}).click();
   await pick(proposal);
   await notice.getByRole('button',{name:'Approve',exact:true}).click();
   const review=notice.getByRole('region',{name:'Proposed criteria changes'});
   await review.getByText(/1,000,000/).waitFor();await review.getByText(/1,200,000/).waitFor();
   await fits('approve');await shot('approve');
   await review.getByRole('button',{name:'Approve changes',exact:true}).click();
   await status('Changes approved and saved. Matches recalculated.');
   assert.deepEqual(d1(`SELECT a.budget_max,p.status FROM applicants a JOIN criteria_proposals p ON p.applicant_id=a.id WHERE a.id=${ana}`),
    [{budget_max:1200000,status:'confirmed'}]);
   assert.equal(d1(`SELECT COUNT(*) AS n FROM notifications WHERE title='${proposal}' AND resolved_at IS NULL`)[0].n,0);
   await fits('approved');await shot('approved');
   assert.deepEqual(d1('SELECT COUNT(*) AS n FROM outbound'),[{n:0}],'nothing is sent');
   await page.close();
  }
  assert.deepEqual(errors,[]);
  console.log('NOT-08/NOT-09 E2E passed: 1280/390, the call task counted under Agency replies, Call shows every number and records a useful answer that closes it, Snooze by keyboard moves a task to the Feed and Wake brings it back, Approve confirms proposed criteria before/after from the notice, nothing sent.');
 }finally{await browser.close();await proxy.dispose();}
})().catch(e=>{console.error(e);process.exitCode=1;});
