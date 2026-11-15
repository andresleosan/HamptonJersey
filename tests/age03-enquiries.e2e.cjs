// Isolated local fixtures only: E2E_PRODUCTION_READONLY=0 E2E_SCRIPT=tests/age03-enquiries.e2e.cjs npm run test:e2e:isolated
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
   console.log('AGE03 width',width);
   // Two homes for sale: the first says it has parking for two cars, the second says nothing about parking.
   const home=i=>`AGE03 ${width} home ${i}`,lid=i=>`HE-G${width}${i}`,agency=`AGE03 Agency ${width}`,desk=`desk-${width}@agency.example.test`;
   d1("UPDATE listings SET matchable=0;DELETE FROM matches;"+[['Parking for two cars'],['']].map(([description],i)=>{
    const row={id:lid(i+1),title:home(i+1),use:'residential',operation:'sale',availability:'for_sale',matchable:1,sale_price:900000,currency:'GBP',
     country:'Jersey',location:'St Helier',bedrooms:3,bathrooms:2,published:0,created_at:'2026-11-09T10:00:00.000Z',updated_at:'2026-11-09T10:00:00.000Z',
     updated_by:'fixture',...extractFeatures({description}),parish:'St Helier'};
    return `INSERT INTO listings(${Object.keys(row)}) VALUES(${Object.values(row).map(value)});`;
   }).join(''));
   const post=async(path,data,expected=200,method='post')=>{const r=await ctx.request[method](base+'api'+path,{headers:{origin},data});
    assert.equal(r.status(),expected,await r.text());return r.json();};
   // The advertiser of both homes, in the directory with its contact details.
   await post('/admin/advertisers',{name:agency,kind:'agency',channels:[],source_ids:[],listing_ids:[lid(1),lid(2)],commission:'',photo_permission:'',
    contacts:[{name:'Agency Desk',email:desk,phones:[{label:'Office',number:'01534 000000'}]}]},201);
   // Ana (three people) and Ben (four) both need two parking spaces and at most £1M; the engine proposes both homes to each.
   const ids=[];
   for(const [name,children] of [['Ana',1],['Ben',2]])ids.push((await post('/admin/applicants',{name:`AGE03 ${name} ${width}`,email:`age03-${name}-${width}@example.test`,
    operation:'buy',source:'phone',budget_max:1000000,parking_spaces:2,pets:[{kind:'none'}],household_adults:2,household_children:children,
    requirement_priorities:{version:1,values:{budget:'must',parking:'must'},unknown:[]}},201)).id);
   const [ana,ben]=ids;
   const matchOf=(a,i)=>d1(`SELECT id FROM matches WHERE applicant_id=${a} AND listing_id='${lid(i)}'`)[0].id;
   const enquiries=()=>d1(`SELECT c.kind,c.listing_id,c.status,c.sent_at,c.sent_via,(SELECT COUNT(*) FROM consultation_matches m WHERE m.consultation_id=c.id) AS matches
    FROM consultations c WHERE c.listing_id LIKE 'HE-G${width}%' ORDER BY c.id`);
   const tasks=()=>d1(`SELECT n.title,n.target_id,n.resolved_at IS NOT NULL AS done FROM notifications n WHERE n.task_key LIKE 'consultation:%'
    AND n.target_id LIKE 'HE-G${width}%' ORDER BY n.id`);
   const page=await ctx.newPage();page.on('pageerror',e=>errors.push(e.message));
   page.setDefaultTimeout(15000);
   await page.setViewportSize({width,height:900});
   const fits=async where=>assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth+1),`no sideways scroll: ${where} at ${width}`);
   const shot=async name=>{if(shots)await page.screenshot({path:join(shots,`age03-${name}-${width}.png`),fullPage:true});};
   const text=async where=>(await where.innerText()).replace(/\s+/g,' ').trim();
   // Polled to its final text, because lists, cards and panels reload after every action.
   const says=async(where,label,expected)=>{
    const ok=async()=>{if(await where.count()!==1)return false;const t=await text(where);return t.startsWith(expected[0])&&expected.every(part=>t.includes(part));};
    for(let i=0;i<80&&!(await ok());i++)await page.waitForTimeout(100);
    assert.ok(await ok(),`${label}: "${await where.count()===1?await text(where):'(not one)'}" should start with "${expected[0]}" and include ${JSON.stringify(expected.slice(1))}`);
   };
   const group=status=>page.locator('.match-group').filter({has:page.locator(`#group-${status}`)});
   const card=(status,i)=>group(status).locator('article.match').filter({has:page.getByRole('link',{name:home(i),exact:true})});
   const state=(where,label)=>where.locator('dl.match-states > div').filter({has:page.locator('dt',{hasText:label})}).locator('dd');
   const settled=async(status,n)=>{
    for(let i=0;i<80&&!(await group(status).getAttribute('aria-busy')==='false'&&await group(status).locator('article.match').count()===n);i++)await page.waitForTimeout(100);
    assert.equal(await group(status).locator('article.match').count(),n,`${status} matches`);
   };
   const proposed=where=>where.locator('.enquiry textarea');

   // Ana's Matches tab: a match nobody approved offers no enquiry.
   await page.goto(base+`admin/#/applicants/${ana}/matches`);
   await settled('found',2);
   await says(state(card('found',1),'Enquiry'),'found card',['Not sent']);
   assert.equal(await card('found',1).getByRole('button',{name:/enquiry/i}).count(),0,'no enquiry from a match that is not approved');
   // Shortlisted by keyboard, it does: the panel proposes a text that names the home and no client.
   await card('found',1).getByRole('button',{name:`Shortlist ${home(1)}`,exact:true}).focus();
   await page.keyboard.press('Enter');
   await settled('shortlisted',1);
   const mine=card('shortlisted',1);
   await says(state(mine,'Enquiry'),'approved card',['Not sent']);
   await mine.getByRole('button',{name:`Prepare enquiry for ${home(1)}`,exact:true}).focus();
   await page.keyboard.press('Enter');
   await mine.locator('form.enquiry').getByText('Availability enquiry',{exact:true}).waitFor();
   await says(mine.locator('form.enquiry select'),'recipient',[agency]);
   const draft=await proposed(mine).inputValue();
   for(const part of [home(1),lid(1),'St Helier','still available','viewing'])assert.ok(draft.includes(part),`the text says ${part}`);
   for(const secret of ['Ana','Ben',`age03-`,'1,000,000','1000000','household'])assert.ok(!draft.includes(secret),`the text has no ${secret}`);
   // Only when the employee ticks it does the text state this one household's size.
   await mine.getByRole('checkbox',{name:/State this search's household size \(3 people\)/}).check();
   assert.match(await proposed(mine).inputValue(),/household of 3 people/);
   await mine.getByRole('checkbox',{name:/State this search's household size/}).uncheck();
   assert.equal(await proposed(mine).inputValue(),draft);
   await fits('proposed enquiry');await shot('proposed');
   await mine.getByRole('button',{name:`Create enquiry for ${home(1)}`,exact:true}).click();
   await says(state(mine,'Enquiry'),'prepared card',['To send manually · Availability enquiry','Not sent yet']);
   await says(mine.locator('div.enquiry > p').nth(1),'prepared panel',['One enquiry for this property, shared by 1 approved match.',`prepared by ${ADMIN}`]);
   await says(mine.locator('div.enquiry address'),'recipient',[agency,'Agency Desk',desk,'Office 01534 000000']);
   assert.deepEqual(enquiries(),[{kind:'general',listing_id:lid(1),status:'manual_pending',sent_at:null,sent_via:null,matches:1}]);
   assert.deepEqual(tasks(),[{title:'Send enquiry manually',target_id:lid(1),done:0}]);
   assert.deepEqual(d1('SELECT COUNT(*) AS n FROM outbound'),[{n:0}],'nothing is written to the email outbox');
   await fits('prepared enquiry');await shot('prepared');

   // Ben approves the same home: his card joins the enquiry that exists; no second one is made.
   await post(`/admin/matches/${matchOf(ben,1)}`,{status:'shortlisted',from:'found'},200,'put');
   await page.goto(base+`admin/#/applicants/${ben}/matches`);
   await settled('shortlisted',1);
   const bens=card('shortlisted',1);
   await bens.getByRole('button',{name:`Prepare enquiry for ${home(1)}`,exact:true}).click();
   await bens.getByText(/^An enquiry about this property is already to send manually, shared by 1 approved match\./).waitFor();
   await bens.getByRole('button',{name:`Join enquiry for ${home(1)}`,exact:true}).click();
   await says(state(bens,'Enquiry'),'joined card',['To send manually · Availability enquiry']);
   await says(bens.locator('div.enquiry > p').nth(1),'joined panel',['One enquiry for this property, shared by 2 approved matches.']);
   assert.deepEqual(enquiries(),[{kind:'general',listing_id:lid(1),status:'manual_pending',sent_at:null,sent_via:null,matches:2}]);
   assert.equal(tasks().length,1,'still one task');

   // The Inbox has the task for the team; it leads to the property, where the recipient and the text are.
   await page.goto(base+'admin/#/');
   const task=page.locator('.inbox-list li').filter({hasText:'Send enquiry manually'}).first();
   await task.waitFor();
   await task.getByRole('button').click();
   const notice=page.locator('article.inbox-detail');
   await notice.getByRole('heading',{name:'Send enquiry manually'}).waitFor();
   await notice.getByText(/Record it as sent only after sending it yourself\./).waitFor();
   await fits('Inbox');await shot('inbox');
   await notice.getByRole('link',{name:'Open property'}).click();
   await page.waitForURL(url=>url.hash===`#/p/${lid(1)}`);
   const section=page.locator('#s-enquiries');
   await section.getByRole('heading',{name:'Enquiries (internal)'}).waitFor();
   await section.scrollIntoViewIfNeeded();
   await says(section.locator('div.enquiry > p').first(),'property panel',['Availability enquiry To send manually']);
   await says(section.locator('div.enquiry address'),'property recipient',[agency,desk]);
   const whole=await text(section)+await proposed(section).inputValue();
   for(const secret of ['AGE03 Ana','AGE03 Ben','age03-','1,000,000'])assert.ok(!whole.includes(secret),`the property's enquiry shows no ${secret}`);
   // Recording it as sent needs how and where the proof is; by keyboard.
   const record=section.getByRole('form',{name:/^Record enquiry \d+ as sent$/});
   await record.getByRole('button',{name:'Record as sent by me'}).focus();
   await page.keyboard.press('Enter');
   await record.getByText('Choose how it was sent',{exact:true}).waitFor();
   await record.getByText('Say where the proof is kept, in 300 characters or fewer',{exact:true}).waitFor();
   assert.equal(enquiries()[0].status,'manual_pending');
   await fits('record errors');
   await record.getByLabel('How it was sent').selectOption('email');
   await record.getByLabel('Evidence reference').fill(`Sent items E2E-EVIDENCE ${width}`);
   await record.getByRole('button',{name:'Record as sent by me'}).click();
   await section.getByText('Recorded as sent by you.',{exact:true}).waitFor();
   await says(section.locator('div.enquiry > p').first(),'sent panel',['Availability enquiry Sent manually']);
   await section.getByText(new RegExp(`by email · recorded by ${ADMIN.replace('.','\\.')} · Evidence: Sent items E2E-EVIDENCE ${width}`)).waitFor();
   assert.equal(await section.getByRole('button',{name:'Record as sent by me'}).count(),0,'recorded once');
   const after=enquiries();
   assert.deepEqual([after.length,after[0].status,after[0].sent_via,after[0].matches],[1,'sent','email',2]);
   assert.deepEqual(tasks(),[{title:'Send enquiry manually',target_id:lid(1),done:1}],'the task closes with it');
   assert.deepEqual(d1('SELECT COUNT(*) AS n FROM outbound'),[{n:0}]);
   await fits('property');await shot('property-sent');

   // Both cards say so; resolving Ana's search takes her out of the enquiry and leaves it open for Ben.
   await page.goto(base+`admin/#/applicants/${ana}/matches`);
   await settled('shortlisted',1);
   await says(state(card('shortlisted',1),'Enquiry'),'sent card',['Sent manually · Availability enquiry','by email']);
   await post(`/admin/applicants/${ana}/search`,{state:'resolved',reason:'Found a home elsewhere',
    updated_at:d1(`SELECT updated_at FROM applicants WHERE id=${ana}`)[0].updated_at});
   await page.reload();
   await settled('shortlisted',1);
   await says(state(card('shortlisted',1),'Enquiry'),'resolved search',['Not sent']);
   await page.goto(base+`admin/#/applicants/${ben}/matches`);
   await settled('shortlisted',1);await settled('found',1);
   await says(state(card('shortlisted',1),'Enquiry'),"Ben's card",['Sent manually · Availability enquiry']);
   await card('shortlisted',1).getByRole('button',{name:`View enquiry for ${home(1)}`,exact:true}).click();
   await says(card('shortlisted',1).locator('div.enquiry > p').nth(1),"Ben's panel",['One enquiry for this property, shared by 1 approved match.']);
   assert.equal(enquiries().length,1);
   await fits("Ben's Matches");await shot('sent');

   // The Review queue: the home that does not answer Ben's must-have gets a clarification enquiry of its own.
   await page.goto(base+'admin/#/review');
   const queued=page.locator('.review .match');
   await queued.getByRole('link',{name:home(2),exact:true}).waitFor();
   assert.equal(await queued.getByRole('button',{name:/enquiry/i}).count(),0,'nothing to prepare before a clarification is approved');
   await queued.getByRole('button',{name:`Approve clarification for ${home(2)}`,exact:true}).click();
   await queued.getByRole('button',{name:`Prepare enquiry for ${home(2)}`,exact:true}).click();
   await queued.locator('form.enquiry').getByText('Clarification enquiry',{exact:true}).waitFor();
   const ask=await proposed(queued).inputValue();
   assert.match(ask,/Parking/);
   for(const not of ['still available','viewing','household','AGE03 Ben'])assert.ok(!ask.includes(not),`a clarification asks only about the must-have: no ${not}`);
   assert.equal(await queued.getByRole('checkbox',{name:/household/}).count(),0);
   await queued.getByRole('button',{name:`Create enquiry for ${home(2)}`,exact:true}).click();
   await says(state(queued,'Enquiry'),'review card',['To send manually · Clarification enquiry']);
   await says(state(queued,'Decision'),'review card',['Not decided']);
   await fits('Review');await shot('review');
   assert.deepEqual(enquiries().map(c=>[c.kind,c.listing_id,c.status,c.matches]),[['general',lid(1),'sent',2],['clarification',lid(2),'manual_pending',1]]);
   assert.deepEqual(d1(`SELECT status FROM matches WHERE id=${matchOf(ben,2)}`),[{status:'found'}],'preparing it decides nothing');

   // That home is then confirmed as available and Ben shortlists it: its availability enquiry asks only for viewing times.
   await post(`/admin/listings/${lid(2)}/availability`,{status:'available',confirmed_at:'2026-11-10T09:30:00.000Z',source:'agency',channel:'phone',
    evidence_ref:`Call note E2E-EVIDENCE ${width}`,scope:'property'},201);
   await post(`/admin/matches/${matchOf(ben,2)}`,{status:'shortlisted',from:'found'},200,'put');
   await page.goto(base+`admin/#/applicants/${ben}/matches`);
   await settled('shortlisted',2);
   const second=card('shortlisted',2);
   await says(state(second,'Availability'),'confirmed card',['Confirmed']);
   await second.getByRole('button',{name:`Prepare enquiry for ${home(2)}`,exact:true}).click();
   await second.getByText(/^Availability already confirmed \(.*\): the text asks only for viewing times\./).waitFor();
   const times=await proposed(second).inputValue();
   assert.ok(times.includes('We understand it is currently available')&&times.includes('viewing')&&!times.includes('still available'),'availability is not asked again');
   await second.getByRole('button',{name:`Create enquiry for ${home(2)}`,exact:true}).click();
   await says(state(second,'Enquiry'),'second card',['To send manually · Availability enquiry']);
   await fits('reused availability');await shot('reused');
   assert.deepEqual(enquiries().map(c=>[c.kind,c.listing_id,c.status]),[['general',lid(1),'sent'],['clarification',lid(2),'manual_pending'],['general',lid(2),'manual_pending']]);
   assert.deepEqual(d1(`SELECT COUNT(*) AS n FROM availability_confirmations WHERE listing_id='${lid(2)}'`),[{n:1}],'an enquiry confirms nothing');
   // Left as the next width expects the Inbox: both recorded as sent.
   for(const [i,pending] of d1(`SELECT id,revision FROM consultations WHERE listing_id='${lid(2)}' ORDER BY id`).entries())
    await post(`/admin/consultations/${pending.id}/manual-send`,{operation_id:`00000000-0000-4000-8000-${i}${String(width).padStart(11,'0')}`,revision:pending.revision,
     sent_at:'2026-11-10T09:30:00.000Z',via:'phone',evidence_ref:`Call note E2E-EVIDENCE ${width}`});
   assert.deepEqual(tasks().map(t=>t.done),[1,1,1]);
   assert.deepEqual(d1('SELECT COUNT(*) AS n FROM outbound'),[{n:0}]);
   await page.close();
  }
  assert.deepEqual(errors,[]);
  console.log('AGE-03 E2E passed: 1280/390, no enquiry before approval, proposed text without client data, household only when ticked, prepare, join, Inbox task to the property, record as sent with errors and by keyboard, resolved search unlinked, clarification enquiry from Review, confirmed availability reused.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
