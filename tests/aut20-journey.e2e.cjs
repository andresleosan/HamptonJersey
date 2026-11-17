// Isolated local fixtures only: E2E_PRODUCTION_READONLY=0 E2E_SCRIPT=tests/aut20-journey.e2e.cjs npm run test:e2e:isolated
// AUT-20 (plan Tarea 3): the visual evidence of the integrated search journey. One synthetic journey is built through the
// panel's own API (with the journey's switches on for this scenario only): two households, one with a rent and a buy
// search; approved matches; one shared enquiry sent by hand and answered "available"; the capture and a photo approved for
// clients; a private presentation reviewed and sent; a viewing proposed to the agency (VIS-17) and accepted by the client
// only; a dictated criteria change; BUS-17's 21-day review for the buy search; a property whose reference photos were purged
// six months after it was confirmed not available (EST-19). Then every key staff screen, and the client's page, is walked
// read-only at 1280 and 390 (screenshots, main actions reachable with Tab, no sideways scroll), and again at 1280 with 200%
// zoom (a 640 CSS px viewport at device scale 2). No console error and no failed same-origin request is allowed.
// Nothing is sent: no email binding and no clock Worker exist in the fixture. Synthetic data only.
const assert=require('node:assert/strict');
const {readFileSync,mkdirSync}=require('node:fs');
const {join,dirname}=require('node:path');
const {parseEnv}=require('node:util');
const {randomUUID}=require('node:crypto');
const {execFileSync}=require('node:child_process');
const {chromium,webkit}=require(process.env.PW||'playwright-core');
const FLAGS=['EST10_LABELS_READY','EST14_JOURNEY_READY','SAP02_COUNTS_READY','EST01_SEARCH_STATE_READY','EST16_AVAILABILITY_READY',
 'EST15_UNAVAILABILITY_READY','SPR03_CAPTURE_READY','SPR08_SECTIONS_READY','AGE03_ENQUIRIES_READY','AGE05_SEND_READY','AGE06_RESPONSES_READY',
 'AGE08_CALL_TASKS_READY','AGE09_EVIDENCE_READY','AGE10_PHOTOS_READY','AGE11_REVIEW_READY','AGE12_PRESENTATIONS_READY','VIS08_CYCLE_READY',
 'VIS17_MULTIPART_READY','BUS07_PROVENANCE_READY','BUS10_IDENTITY_READY','BUS17_REVIEW_READY','AUT19_CRITERIA_PROPOSALS_READY',
 'NOT0809_INBOX_READY','EST19_TRASH_READY','EST19_PURGE_READY'];
(async()=>{
 assert.equal(process.env.HAMPTON_E2E_ISOLATED,'1');assert.equal(process.env.E2E_PRODUCTION_READONLY,'0');
 const vars=parseEnv(readFileSync(process.env.E2E_VARS,'utf8')),{signSession,COOKIE}=await import('../server/auth.js');
 for(const k of FLAGS)assert.equal(vars[k],'1',k);
 const {extractFeatures}=await import('../server/listing-features.js');
 const {searchReviewPass}=await import('../server/search-review.js');
 const {getPlatformProxy}=await import('wrangler');
 const proxy=await getPlatformProxy({configPath:'wrangler.toml',persist:{path:join(process.env.E2E_PERSIST,'v3')}});
 // BUS-17's clock pass on the same local D1 (the fixture has no clock Worker), retried if the dev server holds the lock.
 const clock={...proxy.env,BUS17_REVIEW_READY:'1',EST01_SEARCH_STATE_READY:'1',EST16_AVAILABILITY_READY:'1',EST15_UNAVAILABILITY_READY:'1'};
 const pass=async()=>{for(let i=0;;i++)try{return await searchReviewPass(clock,new Date().toISOString());}
  catch(e){if(i>=5||!/SQLITE_BUSY|commit token/.test(String(e?.stack)))throw e;await new Promise(r=>setTimeout(r,500));}};
 const base=process.env.BASE.replace('127.0.0.1','localhost'),origin=new URL(base).origin,ADMIN='admin@example.test';
 const shots=process.env.E2E_SHOTS;if(shots)mkdirSync(shots,{recursive:true});
 const wrangler=join(dirname(require.resolve('wrangler')),'..','bin','wrangler.js');
 const d1=sql=>JSON.parse(execFileSync(process.execPath,[wrangler,'d1','execute','hampton','--local','--persist-to',process.env.E2E_PERSIST,
  '--json','--command',sql],{encoding:'utf8',stdio:['ignore','pipe','pipe']})).at(-1).results;
 const value=v=>v==null?'NULL':typeof v==='number'?String(v):`'${String(v).replaceAll("'","''")}'`;
 const insert=(table,row)=>`INSERT INTO ${table}(${Object.keys(row)}) VALUES(${Object.values(row).map(value)});`;
 const photo=readFileSync(join(__dirname,'fixtures/media-upload/baseline.jpg')),thumb=readFileSync(join(__dirname,'fixtures/media-upload/thumb.jpg'));
 const browser=await (process.env.HAMPTON_E2E_BROWSER==='webkit'?webkit:chromium).launch({executablePath:process.env.CHROME});
 const errors=[],failed=[],evidence=[];
 const cookie=async()=>[{name:COOKIE,value:await signSession(ADMIN,vars.SESSION_SECRET),domain:new URL(base).hostname,path:'/',httpOnly:true,
  secure:true,sameSite:'Strict'}];
 // Every page: console errors, page errors, failed or refused same-origin requests.
 const watch=(page,where)=>{
  page.on('pageerror',e=>errors.push(`${where}: ${e.message}`));
  page.on('console',m=>{const t=m.text();
   if(m.type()==='error'&&!/Failed to load resource/i.test(t)&&!(process.env.E2E_OFFLINE_FONTS==='1'&&/fonts\./.test(t)))errors.push(`${where}: ${t}`);});
  page.on('response',r=>{const u=new URL(r.url());if(u.origin===origin&&r.status()>=400)failed.push(`${where}: ${r.status()} ${r.request().method()} ${u.pathname}`);});
  page.on('requestfailed',r=>{const u=new URL(r.url()),why=r.failure()?.errorText??'';
   if(u.origin===origin&&!/ERR_ABORTED|NS_BINDING_ABORTED|cancelled/i.test(why))failed.push(`${where}: ${why} ${u.pathname}`);});
 };
 try{
  // ---- The journey, built through the panel's API ---------------------------------------------------------------------------
  const ctx=await browser.newContext();
  await ctx.addCookies(await cookie());
  await ctx.route('https://fonts.googleapis.com/**',route=>route.fulfill({status:200,contentType:'text/css',body:''}));
  const call=async(path,data,expected=200,method='post')=>{const r=await ctx.request[method](base+'api'+path,{headers:{origin},data});
   assert.equal(r.status(),expected,`${method} ${path}: ${await r.text()}`);return r.json();};
  const T='2026-11-09T10:00:00.000Z',HOME='HE-J2001',SALE='HE-J2002',GONE='HE-J2009';
  const home={id:HOME,title:'AUT20 journey home',use:'residential',operation:'rent',availability:'to_let',rent:1800,rent_period:'month',
   currency:'GBP',country:'Jersey',location:'St Helier',parish:'St Helier',bedrooms:2,bathrooms:2,housing_category:'registered',published:0,
   matchable:1,specs:'[]',summary:'Bright flat near the park',created_at:T,updated_at:T,updated_by:'fixture',
   ...extractFeatures({description:'Parking for two cars. Pets allowed'})};
  const sale={...home,id:SALE,title:'AUT20 house for sale',operation:'sale',availability:'for_sale',rent:null,rent_period:null,sale_price:700000,
   bedrooms:3,parish:'St Saviour',location:'St Saviour'};
  const gone={id:GONE,title:'AUT20 house let elsewhere',use:'residential',operation:'sale',availability:'for_sale',country:'Jersey',currency:'GBP',
   published:0,matchable:0,specs:'[]',created_at:T,updated_at:T,updated_by:'fixture'};
  const media=(id,origin,kind)=>insert('media',{id,listing_id:GONE,r2_key:`e2e/${id}.jpg`,thumb_key:`thumbs/e2e/${id}.jpg`,origin,kind,public:0,
   position:0,created_at:T});
  d1('UPDATE listings SET matchable=0;'+insert('listings',home)+insert('listings',sale)+insert('listings',gone)
   +media('AUT20E1','external','photo')+media('AUT20E2','external','photo')
   +insert('availability_confirmations',{listing_id:GONE,status:'unavailable',confirmed_at:'2026-01-10T10:00:00.000Z',source:'agency',channel:'phone',
    evidence_ref:'Call note FIXTURE',recorded_at:'2026-01-10T10:00:00.000Z',recorded_by:ADMIN,reason:'let'}));
  const upload=async(listing,kind,label)=>{const up=await ctx.request.post(base+`api/admin/listings/${listing}/media`,{headers:{origin},multipart:{kind,label,
   file:{name:'photo.jpg',mimeType:'image/jpeg',buffer:photo},thumb:{name:'thumb.jpg',mimeType:'image/jpeg',buffer:thumb}}});
   assert.equal(up.status(),201,await up.text());return (await up.json()).media.id;};
  const photoId=await upload(HOME,'photo','Living room');
  const plan=await upload(GONE,'floorplan','Floor plan'); // the house let elsewhere keeps its floor plan
  // Registration: household one rents (with a dog) and buys; household two rents.
  const one=(await call('/admin/applicants',{name:'AUT20 Household One',email:'aut20-one@example.test',phone:'07700 900801',operation:'rent',
   source:'phone',budget_max:2000,bedrooms_min:2,parking_spaces:2,pets:[{kind:'dog',count:1}],household_adults:2,household_children:0,
   household_children_status:'known',requirement_priorities:{version:1,values:{budget:'must',bedrooms:'must',parking:'must',pets:'must'},unknown:[]}},201)).id;
  const contactOne=d1(`SELECT contact_id FROM applicants WHERE id=${one}`)[0].contact_id;
  const buy=(await call('/admin/applicants',{contact_id:contactOne,source:'phone',operation:'buy',budget_max:600000,bedrooms_min:2},201)).id;
  const two=(await call('/admin/applicants',{name:'AUT20 Household Two',email:'aut20-two@example.test',phone:'07700 900802',operation:'rent',
   source:'phone',budget_max:2000,bedrooms_min:2,parking_spaces:2,pets:[{kind:'none'}],household_adults:2,household_children:1,
   household_children_status:'known',requirement_priorities:{version:1,values:{budget:'must',bedrooms:'must',parking:'must'},unknown:[]}},201)).id;
  const matchOf=a=>d1(`SELECT id FROM matches WHERE applicant_id=${a} AND listing_id='${HOME}'`)[0].id;
  for(const a of [one,two])await call(`/admin/matches/${matchOf(a)}`,{status:'shortlisted',from:'found'},200,'put');
  // The shared enquiry: household one's size stated, household two joins; sent by hand and answered "available".
  const agency=(await call('/admin/advertisers',{name:'AUT20 Fixture Agency',kind:'agency',channels:[],source_ids:[],listing_ids:[HOME],commission:'',
   photo_permission:'',contacts:[{name:'Agency Desk',email:'desk@agency.example.test',phones:[{label:'Office',number:'01534 000000'}]}]},201)).advertiser.id;
  const enquiry=(await call(`/admin/matches/${matchOf(one)}/consultation`,{operation_id:randomUUID(),kind:'general',advertiser_id:agency,
   include_occupants:true},201)).consultation.id;
  await call(`/admin/matches/${matchOf(two)}/consultation`,{operation_id:randomUUID(),kind:'general',advertiser_id:agency});
  await call(`/admin/consultations/${enquiry}/manual-send`,{operation_id:randomUUID(),revision:1,sent_at:new Date().toISOString(),via:'phone',
   evidence_ref:'Call log AUT20-EVIDENCE'});
  await call(`/admin/consultations/${enquiry}/response`,{operation_id:randomUUID(),revision:1,outcome:'available',answered_at:new Date().toISOString(),
   via:'phone',answered_by:'Desk',scope:'property',evidence_ref:'Call log AUT20-ANSWER'});
  // The capture that answer started, and its photo approved for clients.
  const asset=d1(`SELECT id FROM property_capture_assets WHERE media_id='${photoId}' ORDER BY id DESC`)[0].id;
  await call('/admin/photo-permissions',{asset_id:asset,version:0,status:'private_approved',basis:'own'});
  // Presentations: household two's reviewed, approved and sent; household one's created, waiting for its review.
  const sent=await call(`/admin/applicants/${two}/presentations`,{match_ids:[matchOf(two)]},201);
  const review=await call(`/admin/presentations/${sent.id}/review`,undefined,200,'get');
  await call(`/admin/presentations/${sent.id}/approve`,{snapshot_hash:review.snapshot_hash,version:review.approval?.version??0});
  await call(`/admin/presentations/${sent.id}/sent`,{});
  await call(`/admin/applicants/${one}/presentations`,{match_ids:[matchOf(one)]},201);
  // A viewing proposed to the agency from household one's search; the client accepted, the agency not yet.
  const weekday=after=>{const d=new Date(Date.now()+after*864e5);while([0,6].includes(d.getUTCDay()))d.setUTCDate(d.getUTCDate()+1);return d.toISOString().slice(0,10);};
  const viewing=(await call(`/admin/applicants/${one}/viewing-proposals`,{listing_id:HOME,kind:'In person',negotiator_id:2,date:weekday(6),time:'11:00'},201)).id;
  const proposal=d1(`SELECT id,revision FROM viewing_proposals WHERE viewing_id=${viewing}`)[0];
  const answered=await call(`/admin/viewings/${viewing}/proposals/${proposal.id}/responses`,{revision:proposal.revision,participant:'client',
   response:'accepted',channel:'phone',answered_at:new Date().toISOString()});
  assert.equal(answered.confirmed,false,'the agency has not accepted');
  // A dictated criteria change for household two, waiting for a person.
  await call(`/admin/applicants/${two}/criteria-proposals`,{changes:{budget_max:2200},note:'Voice note'},201);
  // BUS-17: the buy search registered 22 days ago with no complete option (a fixture's shortcut on the date only).
  await pass();
  d1(`UPDATE search_review_progress SET enabled_at='2026-01-01T00:00:00.000Z',after_id=0;
   UPDATE applicants SET created_at='${new Date(Date.now()-22*864e5).toISOString()}' WHERE id=${buy};DELETE FROM search_review_cycles WHERE applicant_id=${buy};`);
  for(let i=0;i<2;i++)await pass();
  assert.deepEqual(d1(`SELECT cycle,closed_at IS NULL AS open FROM search_reviews WHERE applicant_id=${buy}`),[{cycle:1,open:1}]);
  // EST-19: the house let elsewhere since January; its two reference photos purged, the floor plan kept.
  const purged=await call('/admin/trash/purge',undefined);
  assert.equal(purged.deleted,2);
  assert.deepEqual(d1(`SELECT id FROM media WHERE listing_id='${GONE}'`).map(r=>r.id),[plan],'only the reference photos went');
  const before={outbound:d1('SELECT COUNT(*) AS n FROM outbound')[0].n,searches:d1(`SELECT id,search_state FROM applicants WHERE id IN (${one},${buy},${two}) ORDER BY id`)};
  assert.equal(before.outbound,0,'nothing was sent');
  await ctx.close();

  // ---- The screens ------------------------------------------------------------------------------------------------------------
  const text=async l=>(await l.innerText()).replace(/\s+/g,' ').trim();
  // Reached with Tab from the top of the page: in the keyboard order, not only focusable by script.
  const reach=async(page,loc,label)=>{
   const target=loc.first();await target.waitFor();
   const h=await target.elementHandle();
   // Start from a temporary first stop at the very top, so the count is from the page's start, not from the last click.
   await page.evaluate(()=>{const b=document.createElement('button');b.id='aut20-start';b.textContent='start';document.body.prepend(b);b.focus();});
   try{
    for(let i=0;i<500;i++){
     await page.keyboard.press('Tab');
     if(await h.evaluate(el=>el===document.activeElement||el.contains(document.activeElement)))return evidence.push(`${label}: Tab ×${i+1}`);
    }
    assert.fail(`${label} is not reachable with Tab`);
   }finally{await page.evaluate(()=>document.getElementById('aut20-start')?.remove());}
  };
  async function walk(page,width,{keyboard=true,tag=String(width)}={}){
   const fits=async where=>assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth+1),
    `no sideways scroll: ${where} at ${tag}`);
   // At device scale 2 a long page passes the browser's capture limit: the zoomed captures are of the window.
   const shot=async name=>{if(shots)await page.screenshot({path:join(shots,`aut20-${name}-${tag}.png`),fullPage:keyboard});};
   // 1. Applicants list with the work labels of each search.
   await page.goto(base+'admin/#/applicants');
   const row=name=>page.getByRole('row').filter({has:page.getByRole('link',{name,exact:true})});
   await row('AUT20 Household One').first().waitFor();
   const all=(await Promise.all((await row('AUT20 Household One').all()).map(r=>r.locator('td[data-label="Work labels"] .badge').allInnerTexts()))).flat();
   assert.ok(all.includes('Viewing pending'),`household one: ${all}`);
   assert.ok(all.includes('Search review due'),`buy search: ${all}`);
   await fits('applicants');await shot('applicants');
   if(keyboard)await reach(page,page.getByLabel('Work label'),`Applicants · Work label filter (${tag})`);
   // 2. Household one's record: quick actions, then its matches with the journey and the presentation waiting for review.
   await page.goto(base+`admin/#/applicants/${one}`);
   const head=page.locator('.record > .head');
   await head.getByRole('button',{name:'Send shortlist'}).waitFor();
   await fits('record');await shot('record');
   if(keyboard){await reach(page,head.getByRole('button',{name:'Send shortlist'}),`Record · Send shortlist (${tag})`);
    await reach(page,head.getByRole('link',{name:'Book viewing'}),`Record · Book viewing (${tag})`);}
   await page.goto(base+`admin/#/applicants/${one}/matches`);
   const card=page.locator('article.match').filter({hasText:'AUT20 journey home'}).first();
   await card.waitFor();
   const journey=await text(card.locator('dl.match-states > div').filter({has:page.locator('dt',{hasText:/^Journey$/})}).locator('dd'));
   assert.ok(journey.length>0,'the journey state is shown');
   const pres=page.locator('#s-presentations');
   await pres.getByRole('button',{name:'Review before sending'}).click();
   const group=pres.getByRole('group',{name:/^Review of link/});
   await group.getByText('AUT20 journey home').first().waitFor();
   await group.getByRole('button',{name:'Approve this presentation'}).waitFor();
   await fits('matches and review');await shot('matches-review');
   if(keyboard)await reach(page,group.getByRole('button',{name:'Approve this presentation'}),`Matches · Approve this presentation (${tag})`);
   // 3. The property's enquiries with AGE-09's evidence, opened by keyboard.
   await page.goto(base+`admin/#/p/${HOME}`);
   const section=page.locator('#s-enquiries');
   await section.getByRole('heading',{name:'Enquiries (internal)'}).waitFor();
   const toggle=section.getByRole('button',{name:'Evidence of what was shared'});
   if(keyboard)await reach(page,toggle,`Property · Evidence of what was shared (${tag})`);
   await toggle.focus();await page.keyboard.press('Enter');
   const proof=section.getByRole('region',{name:'Evidence of what was shared'});
   await proof.getByText(/Call log AUT20-EVIDENCE/).first().waitFor();
   const said=await text(proof);
   for(const secret of ['AUT20 Household','aut20-one','aut20-two','07700 9008'])assert.ok(!said.includes(secret),`no ${secret} in the evidence`);
   await fits('enquiries');await shot('enquiries');
   // 4. The viewing, agreed with everyone: the client accepted, the agency not yet; Confirm cannot skip it.
   await page.goto(base+`admin/#/viewings?viewing=${viewing}`);
   const coord=page.locator('article.inbox-detail section.coord');
   await coord.getByText('Waiting for answers',{exact:true}).waitFor();
   assert.equal(await page.locator('article.inbox-detail').getByRole('button',{name:'Confirm',exact:true}).count(),0);
   await fits('viewing');await shot('viewing');
   if(keyboard)await reach(page,coord.getByRole('button',{name:'Record answer'}),`Viewing · Record answer (${tag})`);
   // 5. The Inbox: BUS-17's 21-day review for the buy search.
   await page.goto(base+'admin/#/');
   const task=page.locator('.inbox-list li').filter({hasText:'21-day search review for AUT20 Household One'}).first();
   await task.waitFor();
   await task.getByRole('button').click();
   const notice=page.locator('article.inbox-detail');
   await notice.getByRole('heading',{name:'21-day search review for AUT20 Household One'}).waitFor();
   await notice.getByRole('button',{name:'Done'}).waitFor();
   await fits('inbox');await shot('inbox');
   if(keyboard){await reach(page,task.getByRole('button'),`Inbox · open the review (${tag})`);
    await reach(page,notice.getByRole('button',{name:'Done'}),`Inbox · Done (${tag})`);}
   // 6. The property let elsewhere: its history records the purge; the floor plan stays.
   await page.goto(base+`admin/#/p/${GONE}`);
   const history=page.getByRole('region',{name:'History',exact:true});
   const nav=page.getByRole('navigation',{name:'Listing sections'}).getByRole('button',{name:'History',exact:true});
   if(keyboard)await reach(page,nav,`Property · History (${tag})`);
   await nav.focus();await page.keyboard.press('Enter');
   await history.getByText('Reference photos removed after six months not available').first().waitFor();
   await fits('history');await shot('history');
  }
  async function client(width,tag=String(width),scale){
   const guest=await browser.newContext({viewport:{width,height:900},...(scale&&{deviceScaleFactor:scale})});
   await guest.route('https://fonts.googleapis.com/**',route=>route.fulfill({status:200,contentType:'text/css',body:''}));
   const page=await guest.newPage();page.setDefaultTimeout(15000);watch(page,`client ${tag}`);
   await page.goto(sent.link);
   const li=page.locator('li.home').first();
   await li.getByText('AUT20 journey home').first().waitFor();
   assert.ok((await text(li)).includes('Availability confirmed'),'the confirmed home');
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth+1),`client fits at ${tag}`);
   if(shots)await page.screenshot({path:join(shots,`aut20-client-${tag}.png`),fullPage:true});
   await reach(page,li.getByRole('radio',{name:"I'm interested"}),`Client page · I'm interested (${tag})`);
   await reach(page,li.getByRole('button',{name:'Send answer'}),`Client page · Send answer (${tag})`);
   await guest.close();
  }
  for(const width of [1280,390]){
   console.log('AUT20 width',width);
   const staff=await browser.newContext({viewport:{width,height:900},reducedMotion:'reduce'});
   await staff.addCookies(await cookie());
   await staff.route('https://fonts.googleapis.com/**',route=>route.fulfill({status:200,contentType:'text/css',body:''}));
   const page=await staff.newPage();page.setDefaultTimeout(15000);watch(page,`staff ${width}`);
   await walk(page,width);
   await staff.close();
   await client(width);
  }
  // 1280 at 200% zoom: the same CSS layout a 640 px window gives, at device scale 2.
  console.log('AUT20 1280 at 200%');
  const zoomed=await browser.newContext({viewport:{width:640,height:450},deviceScaleFactor:2,reducedMotion:'reduce'});
  await zoomed.addCookies(await cookie());
  await zoomed.route('https://fonts.googleapis.com/**',route=>route.fulfill({status:200,contentType:'text/css',body:''}));
  const page=await zoomed.newPage();page.setDefaultTimeout(15000);watch(page,'staff 1280@200%');
  await walk(page,640,{keyboard:false,tag:'1280-zoom200'});
  await zoomed.close();
  await client(640,'1280-zoom200',2);

  assert.equal(d1('SELECT COUNT(*) AS n FROM outbound')[0].n,0,'nothing was sent');
  assert.deepEqual(d1(`SELECT id,search_state FROM applicants WHERE id IN (${one},${buy},${two}) ORDER BY id`),before.searches,'walking changed no search');
  assert.deepEqual(errors,[],'no console or page errors');
  assert.deepEqual(failed,[],'no failed same-origin requests');
  for(const line of evidence)console.log('AUT20 keyboard',line);
  console.log('AUT-20 journey E2E passed at 1280, 390 and 1280 with 200% zoom: applicants with work labels, record and matches with the presentation review, enquiries with AGE-09 evidence, VIS-17 viewing waiting for the agency, BUS-17 review in the Inbox, property history after the EST-19 purge, and the client page; nothing sent, no search changed.');
 }finally{await browser.close();await proxy.dispose();}
})().catch(e=>{console.error(e);process.exitCode=1;});
