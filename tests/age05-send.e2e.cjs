// Isolated local fixtures only: E2E_PRODUCTION_READONLY=0 E2E_SCRIPT=tests/age05-send.e2e.cjs npm run test:e2e:isolated
// AGE-05 in the panel: the contact chosen, the approval of one version and its one queued email. The fixture has no
// clock Worker and no email binding, so nothing is ever sent here: what the clock writes after the provider answers
// is set by hand below, and proved with a simulated provider in tests/server/age-05-send.test.mjs.
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
   console.log('AGE05 width',width);
   const home=`AGE05 ${width} home`,lid=`HE-S${width}1`,agency=`AGE05 Agency ${width}`,desk=`desk-${width}@agency.example.test`;
   const row={id:lid,title:home,use:'residential',operation:'sale',availability:'for_sale',matchable:1,sale_price:900000,currency:'GBP',
    country:'Jersey',location:'St Helier',bedrooms:3,bathrooms:2,published:0,created_at:'2026-11-09T10:00:00.000Z',updated_at:'2026-11-09T10:00:00.000Z',
    updated_by:'fixture',...extractFeatures({description:'Parking for two cars'}),parish:'St Helier'};
   // The email service is set up in this fixture (EMAIL_SERVICE_READY), and the team has not enabled email sending yet.
   d1("UPDATE listings SET matchable=0;DELETE FROM matches;DELETE FROM app_settings WHERE key IN ('email','outbound','email_worker');"
    +`INSERT INTO listings(${Object.keys(row)}) VALUES(${Object.values(row).map(value)});`);
   const post=async(path,data,expected=200,method='post')=>{const r=await ctx.request[method](base+'api'+path,{headers:{origin},data});
    assert.equal(r.status(),expected,await r.text());return r.json();};
   await post('/admin/advertisers',{name:agency,kind:'agency',channels:[],source_ids:[],listing_ids:[lid],commission:'',photo_permission:'',
    contacts:[{name:'Agency Desk',email:desk,phones:[{label:'Office',number:'01534 000000'}]},
     {name:'Agency Mobile',email:'',phones:[{label:'Mobile',number:'07700 900555'}]},{name:'No Channel',email:'',phones:[]}]},201);
   const ana=(await post('/admin/applicants',{name:`AGE05 Ana ${width}`,email:`age05-ana-${width}@example.test`,operation:'buy',source:'phone',
    budget_max:1000000,parking_spaces:2,pets:[{kind:'none'}],household_adults:2,household_children:1,
    requirement_priorities:{version:1,values:{budget:'must',parking:'must'},unknown:[]}},201)).id;
   const match=d1(`SELECT id FROM matches WHERE applicant_id=${ana} AND listing_id='${lid}'`)[0].id;
   await post(`/admin/matches/${match}`,{status:'shortlisted',from:'found'},200,'put');
   const enquiry=()=>d1(`SELECT id,status,revision,contact_key,approved_revision,approved_by,email_ref,sent_at,sent_via,sent_by FROM consultations WHERE listing_id='${lid}'`)[0];
   const outbound=()=>d1(`SELECT o.status,o.template,o.recipient,o.version FROM outbound o JOIN consultations c ON c.id=CAST(o.entity_id AS INTEGER)
    WHERE o.template='enquiry' AND c.listing_id='${lid}' ORDER BY o.id`);
   const task=()=>d1(`SELECT title,resolved_at IS NOT NULL AS done FROM notifications WHERE task_key LIKE 'consultation:%' AND target_id='${lid}'`)[0];
   const page=await ctx.newPage();page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
   page.setDefaultTimeout(15000);
   await page.setViewportSize({width,height:900});
   const fits=async where=>assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth+1),`no sideways scroll: ${where} at ${width}`);
   const shot=async name=>{if(shots)await page.screenshot({path:join(shots,`age05-${name}-${width}.png`),fullPage:true});};
   const text=async where=>(await where.innerText()).replace(/\s+/g,' ').trim();
   // Polled to its final text, because cards and panels reload after every action.
   const says=async(where,label,expected)=>{
    const ok=async()=>{if(await where.count()!==1)return false;const t=await text(where);return t.startsWith(expected[0])&&expected.every(part=>t.includes(part));};
    for(let i=0;i<80&&!(await ok());i++)await page.waitForTimeout(100);
    assert.ok(await ok(),`${label}: "${await where.count()===1?await text(where):'(not one)'}" should start with "${expected[0]}" and include ${JSON.stringify(expected.slice(1))}`);
   };
   const group=status=>page.locator('.match-group').filter({has:page.locator(`#group-${status}`)});
   const card=status=>group(status).locator('article.match').filter({has:page.getByRole('link',{name:home,exact:true})});
   const state=(where,label)=>where.locator('dl.match-states > div').filter({has:page.locator('dt',{hasText:label})}).locator('dd');
   const settled=async(status,n)=>{
    for(let i=0;i<80&&!(await group(status).getAttribute('aria-busy')==='false'&&await group(status).locator('article.match').count()===n);i++)await page.waitForTimeout(100);
    assert.equal(await group(status).locator('article.match').count(),n,`${status} matches`);
   };

   // Preparing the enquiry: the contact is chosen among those of the recipient that can be reached.
   await page.goto(base+`admin/#/applicants/${ana}/matches`);
   await settled('shortlisted',1);
   const mine=card('shortlisted');
   await mine.getByRole('button',{name:`Prepare enquiry for ${home}`,exact:true}).click();
   const create=mine.locator('form.enquiry');
   await create.getByText('Availability enquiry',{exact:true}).waitFor();
   assert.deepEqual(await create.getByLabel('Contact').locator('option').allTextContents(),
    ['Not chosen',`Agency Desk · ${desk}`,'Agency Mobile · Mobile 07700 900555'],'a contact with no email and no phone is not offered');
   await create.getByLabel('Contact').selectOption({label:'Agency Mobile · Mobile 07700 900555'});
   await fits('proposed enquiry');await shot('proposed');
   await create.getByRole('button',{name:`Create enquiry for ${home}`,exact:true}).click();
   await says(state(mine,'Enquiry'),'prepared card',['To send manually · Availability enquiry']);
   await mine.getByText('Contact for this enquiry: Agency Mobile · Mobile 07700 900555',{exact:true}).waitFor();
   // Email sending is not enabled: the panel says so, offers no approval and no sending, and nothing is queued.
   const byEmail=where=>where.getByRole('group',{name:/^Send enquiry \d+ by email$/});
   await says(byEmail(mine),'email not enabled',['Email sending is switched off in Email settings, so nothing is sent from here: send it yourself and record it below.']);
   assert.equal(await mine.getByRole('button',{name:/Approve sending|Send by email/}).count(),0);
   assert.equal(await mine.getByRole('button',{name:'Record as sent by me'}).count(),1,'the manual channel is there as before');
   let c=enquiry();
   assert.deepEqual([c.status,c.revision,c.approved_revision,c.email_ref],['manual_pending',1,null,null]);
   assert.match(c.contact_key,/^[0-9a-f]{64}$/);
   assert.ok(!JSON.stringify(d1(`SELECT * FROM consultations WHERE listing_id='${lid}'`)).includes('agency.example'),'the enquiry keeps no address');
   assert.deepEqual(outbound(),[]);
   await fits('email not enabled');await shot('not-enabled');

   // The team enables email sending, and the clock's email sender reports itself running (no clock runs in this fixture).
   // On the property, a contact with a phone only cannot be written to by the app.
   const running=new Date().toISOString();
   d1(`INSERT INTO app_settings(key,value,updated_at,updated_by) VALUES('email','{"enabled":true,"summary":false,"recipients":[],"revision":1,`
    +`"approved_by":"${ADMIN}","approved_at":"2026-11-15T09:00:00.000Z"}','2026-11-15T09:00:00.000Z','fixture');`
    +`INSERT INTO app_settings(key,value,updated_at,updated_by) VALUES('email_worker','{"at":"${running}","ready":true}','${running}','system')`);
   await page.goto(base+`admin/#/p/${lid}`);
   const section=page.locator('#s-enquiries');
   await section.getByRole('heading',{name:'Enquiries (internal)'}).waitFor();
   await section.scrollIntoViewIfNeeded();
   const head=section.locator('div.enquiry > p').first(),facts=section.locator('div.enquiry > p').nth(1);
   await says(head,'property panel',['Availability enquiry To send manually']);
   await says(byEmail(section),'phone only',['To send it from the app, choose a contact with an email address and save.']);
   assert.equal(await section.getByRole('button',{name:/Approve sending|Send by email/}).count(),0);
   // The desk's email is chosen and saved, by keyboard: a new version, which nobody has approved.
   const change=section.getByRole('form',{name:/^Change enquiry \d+$/});
   await change.getByLabel('Contact').selectOption({label:`Agency Desk · ${desk}`});
   await change.getByRole('button',{name:'Save changes'}).focus();
   await page.keyboard.press('Enter');
   await says(facts,'saved',['One enquiry for this property, shared by 1 approved match.','Version 2']);
   await section.getByText(`Contact for this enquiry: Agency Desk · ${desk}`,{exact:true}).waitFor();
   await says(byEmail(section),'to approve',[`Approving confirms this recipient, ${desk} and this exact text. Any change after it needs a new approval.`]);
   const send=section.getByRole('button',{name:'Send by email'}),approve=section.getByRole('button',{name:'Approve sending'});
   assert.equal(await send.isDisabled(),true,'nothing is sent without an approval');
   await fits('to approve');await shot('to-approve');
   await approve.focus();
   await page.keyboard.press('Enter');
   await says(byEmail(section),'approved',[`Sending approved by ${ADMIN}`,'for this version only.']);
   assert.equal(await approve.count(),0);
   assert.equal(await send.isDisabled(),false);
   c=enquiry();
   assert.deepEqual([c.status,c.revision,c.approved_revision,c.approved_by],['manual_pending',2,2,ADMIN]);
   // Saving again is another version: the approval does not cover it.
   await change.getByRole('button',{name:'Save changes'}).click();
   await says(facts,'saved again',['One enquiry for this property, shared by 1 approved match.','Version 3']);
   await says(byEmail(section),'approval gone',['Approving confirms this recipient']);
   assert.equal(await send.isDisabled(),true);
   assert.deepEqual(outbound(),[],'still nothing queued');
   await approve.click();
   await says(byEmail(section),'approved again',[`Sending approved by ${ADMIN}`]);
   await fits('approved');await shot('approved');
   // Sent by email: one email is queued, the manual forms go away and the Inbox task stays open until it is sent.
   await send.click();
   await says(head,'queued panel',['Availability enquiry Queued by email']);
   const queued=section.getByRole('group',{name:/^Queued email of enquiry \d+$/});
   await says(queued.getByRole('status'),'queued note',[`Email queued for ${desk} by ${ADMIN}.`,'checked again just before it leaves','Reference: HE-OUT-']);
   await queued.getByText('It leaves within about ten minutes.',{exact:true}).waitFor();
   assert.equal(await section.getByRole('button',{name:/Record as sent by me|Save changes|Send by email|Approve sending/}).count(),0);
   c=enquiry();
   assert.deepEqual([c.status,c.revision,c.sent_at,c.sent_by],['queued',3,null,ADMIN]);
   assert.deepEqual(outbound(),[{status:'queued',template:'enquiry',recipient:desk,version:3}]);
   assert.deepEqual(task(),{title:'Enquiry email queued',done:0});
   await fits('queued');await shot('queued');
   await page.goto(base+`admin/#/applicants/${ana}/matches`);
   await settled('shortlisted',1);
   await says(state(card('shortlisted'),'Enquiry'),'queued card',['Queued by email · Availability enquiry']);

   // Sending is paused: the panel says why it has not left, and a person takes it back to manual sending, by keyboard.
   await post('/admin/outbound/pause',{});
   await page.goto(base+`admin/#/p/${lid}`);
   await section.scrollIntoViewIfNeeded();
   await says(queued.locator('p.req-note'),'held',['Sending is paused (Pause all outbound), so nothing leaves: it goes when sending resumes, or return it to manual sending and send it yourself.']);
   await fits('held');await shot('held');
   await queued.getByRole('button',{name:'Return to manual sending'}).focus();
   await page.keyboard.press('Enter');
   await section.getByText('Returned to manual sending. Nothing has been sent.',{exact:true}).waitFor();
   await says(head,'returned',['Availability enquiry To send manually']);
   await says(facts,'returned version',['One enquiry for this property, shared by 1 approved match.','Version 4']);
   c=enquiry();
   assert.deepEqual([c.status,c.revision,c.approved_revision,c.email_ref,c.sent_at],['manual_pending',4,3,null,null]);
   assert.deepEqual(outbound(),[{status:'cancelled',template:'enquiry',recipient:desk,version:3}]);
   assert.deepEqual(task(),{title:'Send enquiry manually',done:0});
   await says(byEmail(section),'still paused',['Sending is paused (Pause all outbound), so nothing is queued']);
   await post('/admin/outbound/resume',{});
   await page.reload();
   await section.scrollIntoViewIfNeeded();
   await says(byEmail(section),'resumed',['Approving confirms this recipient']);
   assert.equal(await send.isDisabled(),true,'the old approval does not cover the new version');
   await approve.click();
   await says(byEmail(section),'approved after return',[`Sending approved by ${ADMIN}`]);
   await send.click();
   await says(head,'queued after return',['Availability enquiry Queued by email']);
   c=enquiry();

   // What the clock writes when the email service does not confirm the result, set by hand: a person says what happened.
   d1(`UPDATE outbound SET status='unknown',error_code='UNKNOWN_RESULT' WHERE ref='${c.email_ref}';UPDATE consultations SET status='needs_review' WHERE id=${c.id}`);
   await page.reload();
   await section.scrollIntoViewIfNeeded();
   await says(head,'unconfirmed panel',['Availability enquiry Awaiting email check']);
   const check=section.getByRole('group',{name:/^Check the email of enquiry \d+$/});
   await says(check.getByRole('alert'),'unconfirmed',[`The email service did not confirm whether this email went out to ${desk}`,'never sent again automatically']);
   assert.equal(await section.getByRole('button',{name:/Record as sent by me|Send by email/}).count(),0);
   await fits('unconfirmed');await shot('unconfirmed');
   await check.getByRole('button',{name:'It was not sent'}).click();
   await section.getByText('Recorded as not sent. Nothing has been sent.',{exact:true}).waitFor();
   await says(head,'back to a person',['Availability enquiry To send manually']);
   await says(facts,'new version',['One enquiry for this property, shared by 1 approved match.','Version 5']);
   c=enquiry();
   assert.deepEqual([c.status,c.revision,c.email_ref,c.sent_at,c.sent_by],['manual_pending',5,null,null,null]);
   assert.deepEqual(task(),{title:'Send enquiry manually',done:0});
   // The new version is approved and queued in its turn: a second email, never the first one again.
   assert.equal(await send.isDisabled(),true);
   await approve.click();
   await says(byEmail(section),'approved once more',[`Sending approved by ${ADMIN}`]);
   await send.click();
   await says(head,'queued again',['Availability enquiry Queued by email']);
   assert.deepEqual(outbound(),[{status:'cancelled',template:'enquiry',recipient:desk,version:3},{status:'unknown',template:'enquiry',recipient:desk,version:4},
    {status:'queued',template:'enquiry',recipient:desk,version:5}]);
   // What the clock writes once the provider accepts it, set by hand: sent by email, with who approved it and its reference.
   c=enquiry();
   d1(`UPDATE outbound SET status='accepted',message_id='fixture-${width}',updated_at='2026-11-15T10:00:00.000Z' WHERE ref='${c.email_ref}';`
    +`UPDATE consultations SET status='sent',sent_at='2026-11-15T10:00:00.000Z',sent_via='email' WHERE id=${c.id}`);
   await page.reload();
   await section.scrollIntoViewIfNeeded();
   await says(head,'sent panel',['Availability enquiry Sent by email']);
   await says(section.locator('div.enquiry > p').nth(2),'sent line',['Sent ',`by email from the app to ${desk} · approved by ${ADMIN} · sent by ${ADMIN}`,`Reference: HE-OUT-${c.email_ref}`]);
   assert.equal(await section.getByRole('button',{name:/Record as sent by me|Save changes|Send by email|Approve sending|It was/}).count(),0);
   const whole=await text(section);
   for(const secret of ['AGE05 Ana','age05-ana','1,000,000'])assert.ok(!whole.includes(secret),`the property's enquiry shows no ${secret}`);
   await fits('sent');await shot('sent');
   await page.close();
  }
  assert.deepEqual(errors,[]);
  console.log('AGE-05 E2E passed: 1280/390, contact chosen among those reachable and kept by reference, no approval or sending while email is not enabled, '
   +'approval by keyboard bound to one version and lost on Save changes, one queued email with the manual forms gone and its task open, '
   +'paused email says why and is returned to manual sending by keyboard, unconfirmed result answered by a person, '
   +'new version approved and queued, sent by email with approver and reference, no sideways scroll, no client data');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
