// Isolated local fixtures only: E2E_PRODUCTION_READONLY=0 E2E_SCRIPT=tests/sap09-quick-actions.e2e.cjs npm run test:e2e:isolated
// SAP-09: the applicant record's quick actions. Send shortlist opens AGE-12/AGE-11's private presentation with the
// approved, available homes ticked (nothing is created or sent by it); Book viewing opens New viewing with the search's
// contact, books Hampton's own house at once, and for a house another agency advertises only proposes the time (VIS-17):
// the request is held, not confirmed, until the client and the agency accept. Synthetic data only.
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
 for(const k of ['AGE11_REVIEW_READY','AGE12_PRESENTATIONS_READY','VIS17_MULTIPART_READY','BUS07_PROVENANCE_READY'])assert.equal(vars[k],'1',k);
 const base=process.env.BASE.replace('127.0.0.1','localhost'),origin=new URL(base).origin,ADMIN='admin@example.test';
 const shots=process.env.E2E_SHOTS;if(shots)mkdirSync(shots,{recursive:true});
 const wrangler=join(dirname(require.resolve('wrangler')),'..','bin','wrangler.js');
 const d1=sql=>JSON.parse(execFileSync(process.execPath,[wrangler,'d1','execute','hampton','--local','--persist-to',process.env.E2E_PERSIST,
  '--json','--command',sql],{encoding:'utf8',stdio:['ignore','pipe','pipe']})).at(-1).results;
 const value=v=>v==null?'NULL':typeof v==='number'?String(v):`'${String(v).replaceAll("'","''")}'`;
 const insert=(table,row)=>`INSERT INTO ${table}(${Object.keys(row)}) VALUES(${Object.values(row).map(value)});`;
 const photo=readFileSync(join(__dirname,'fixtures/media-upload/baseline.jpg')),thumb=readFileSync(join(__dirname,'fixtures/media-upload/thumb.jpg'));
 const browser=await (process.env.HAMPTON_E2E_BROWSER==='webkit'?webkit:chromium).launch({executablePath:process.env.CHROME});
 try{
  const ctx=await browser.newContext();
  await ctx.addCookies([{name:COOKIE,value:await signSession(ADMIN,vars.SESSION_SECRET),domain:new URL(base).hostname,path:'/',httpOnly:true,secure:true,sameSite:'Strict'}]);
  await ctx.route('https://fonts.googleapis.com/**',route=>route.fulfill({status:200,contentType:'text/css',body:''}));
  const errors=[];
  const post=async(path,data,expected=200,method='post')=>{const r=await ctx.request[method](base+'api'+path,{headers:{origin},data});
   assert.equal(r.status(),expected,await r.text());return r.json();};
  for(const width of [1280,390]){
   console.log('SAP09 width',width);
   // Hampton's own house (S), presentable; a house another agency advertises (T), shortlisted but not confirmed available.
   const own=`HE-S${width}`,agency=`HE-T${width}`,stamp='2026-11-09T10:00:00.000Z';
   const home=(id,title)=>insert('listings',{id,title,use:'residential',operation:'sale',availability:'for_sale',matchable:1,sale_price:900000,
    currency:'GBP',country:'Jersey',location:'St Helier',bedrooms:3,bathrooms:2,published:0,specs:'[]',created_at:stamp,updated_at:stamp,
    updated_by:'fixture',summary:'Bright family home',...extractFeatures({description:'Parking for two cars'}),parish:'St Helier'});
   d1('UPDATE listings SET matchable=0;'+home(own,`SAP09 own ${width}`)+home(agency,`SAP09 agency ${width}`)
    +insert('advertisers',{name:`Fixture Agency ${width}`,kind:'agency',details:JSON.stringify({contacts:[],channels:[],source_ids:[],
     listing_ids:[agency],commission:'',photo_permission:''}),activity_on:'2026-11-09',created_at:stamp,updated_at:stamp,updated_by:'fixture'}));
   const up=await ctx.request.post(base+`api/admin/listings/${own}/media`,{headers:{origin},multipart:{kind:'photo',label:'Front',
    file:{name:'photo.jpg',mimeType:'image/jpeg',buffer:photo},thumb:{name:'thumb.jpg',mimeType:'image/jpeg',buffer:thumb}}});
   assert.equal(up.status(),201,await up.text());
   const media=(await up.json()).media.id;
   await post(`/admin/listings/${own}/availability`,{status:'available',confirmed_at:'2026-11-10T09:30:00.000Z',source:'owner',channel:'phone',
    scope:'property',evidence_ref:`Call note SAP09 ${width}`},201);
   const asset=d1(`SELECT id FROM property_capture_assets WHERE media_id='${media}' ORDER BY id DESC`)[0].id;
   await post('/admin/photo-permissions',{asset_id:asset,version:0,status:'private_approved',basis:'own'});
   const name=`SAP09 Ana ${width}`,email=`sap09-ana-${width}@example.test`;
   const ana=(await post('/admin/applicants',{name,email,operation:'buy',source:'phone',budget_max:1000000,parking_spaces:2,pets:[{kind:'none'}],
    household_adults:2,household_children:1,requirement_priorities:{version:1,values:{budget:'must',parking:'must'},unknown:[]}},201)).id;
   for(const lid of [own,agency]){
    const match=d1(`SELECT id FROM matches WHERE applicant_id=${ana} AND listing_id='${lid}'`)[0].id;
    await post(`/admin/matches/${match}`,{status:'shortlisted',from:'found'},200,'put');
   }
   const grants=()=>d1(`SELECT id, sent_at FROM presentation_grants WHERE applicant_id=${ana}`);

   const page=await ctx.newPage();page.on('pageerror',e=>errors.push(e.message));
   page.on('console',m=>{if(m.type()==='error'&&!/Failed to load resource/i.test(m.text()))errors.push(m.text());});
   page.setDefaultTimeout(15000);
   await page.setViewportSize({width,height:900});
   const fits=async where=>assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth+1),
    `no sideways scroll: ${where} at ${width}`);
   const tall=async(target,where)=>{const box=await target.boundingBox();assert.ok(box.height>=(width<760?44:32),`${where} at ${width}: ${box.height}px`);};
   await page.goto(base+`admin/#/applicants/${ana}`);
   const head=page.locator('.record > .head');
   const send=head.getByRole('button',{name:'Send shortlist'}),book=head.getByRole('link',{name:'Book viewing'});
   await send.waitFor();await tall(send,'Send shortlist');await tall(book,'Book viewing');await fits('record');
   if(shots)await head.screenshot({path:join(shots,`sap09-actions-${width}.png`)});

   // Send shortlist: the presentable home ticked (not the unconfirmed agency one), focus on Create; nothing created or sent.
   await send.click();
   await page.waitForURL(/\/matches$/);
   const card=page.locator('#s-presentations');
   await card.getByRole('status').filter({hasText:'1 approved, available home ticked.'}).waitFor();
   assert.equal(await card.getByRole('checkbox',{name:new RegExp(own)}).isChecked(),true);
   assert.equal(await card.getByRole('checkbox',{name:new RegExp(agency)}).count(),0,'pending_pets_not_presented: only what AGE-12 may present');
   assert.equal(await page.evaluate(()=>document.activeElement?.textContent),'Create private link');
   assert.deepEqual(grants(),[],'no_send_on_navigation');
   await send.click();await send.click();
   assert.deepEqual(grants(),[],'double_click_no_duplicate');
   await fits('presentation');
   await card.getByRole('button',{name:'Create private link'}).click();
   await card.getByLabel('New private link · shown only now').waitFor();
   assert.equal(grants().length,1);
   // Again: the link waiting to be sent opens for review; never a second one.
   await page.goto(base+`admin/#/applicants/${ana}`);
   await send.click();
   await card.getByRole('group',{name:/^Review of link/}).waitFor();
   await card.getByRole('status').filter({hasText:'A link is waiting to be sent'}).waitFor();
   assert.deepEqual(grants().map(g=>g.sent_at),[null],'still not sent');
   if(shots)await card.screenshot({path:join(shots,`sap09-shortlist-${width}.png`)});

   // Book viewing from the record: New viewing with the search's contact, linked back to it.
   await page.goto(base+`admin/#/applicants/${ana}`);
   await book.click();
   const form=page.locator('form.view-new');
   await form.getByRole('link',{name}).waitFor();
   assert.equal(await form.getByLabel('Name').inputValue(),name);
   assert.equal(await form.getByLabel('Email').inputValue(),email);
   assert.equal(await page.evaluate(()=>location.hash),`#/viewings?applicant=${ana}`,'ids only in the address');

   // From the own house's match: booked at once, as by phone.
   const pick=async picker=>{
    await picker.locator('select').first().selectOption({index:1});
    const day=picker.locator('input[name$="-day"]:not(:disabled)').first();await day.waitFor();await day.click();
    const time=picker.locator('input[name$="-time"]:not(:disabled)').first();await time.waitFor();await time.click();
   };
   const matchCard=title=>page.locator('article.match').filter({has:page.getByRole('heading',{name:title})});
   await page.goto(base+`admin/#/applicants/${ana}/matches`);
   const ownBook=matchCard(`SAP09 own ${width}`).getByRole('link',{name:/^Book viewing/});
   await tall(ownBook,'match Book viewing');
   await ownBook.click();
   await form.getByText('It is confirmed straight away.').waitFor();
   assert.equal(await form.getByLabel('Property').inputValue(),own);
   await page.waitForFunction(n=>document.querySelector('form.view-new input')?.value===n,name);
   await pick(form.locator('.slot-picker'));
   await form.getByRole('button',{name:'Book viewing'}).click();
   await page.getByRole('status').filter({hasText:/^Viewing booked for /}).waitFor();
   assert.deepEqual(d1(`SELECT status, name, email FROM viewing_requests WHERE listing_id='${own}'`),[{status:'confirmed',name,email}]);

   // From the agency's house: the time is proposed, held as a request, never booked as their acceptance.
   await page.goto(base+`admin/#/applicants/${ana}/matches`);
   await matchCard(`SAP09 agency ${width}`).getByRole('link',{name:/^Book viewing/}).click();
   await form.getByRole('note').filter({hasText:`Advertised by Fixture Agency ${width}.`}).waitFor();
   assert.equal(await form.getByText('It is confirmed straight away.').count(),0);
   assert.equal(await form.getByRole('button',{name:'Book viewing'}).count(),0);
   await form.getByText(`Client: ${name}`).waitFor();
   await form.getByRole('button',{name:'Propose this time'}).click();
   await form.getByText('Choose a negotiator, a day and a time').first().waitFor();
   await pick(form.locator('.slot-picker'));
   await fits('propose');
   if(shots)await form.screenshot({path:join(shots,`sap09-propose-${width}.png`)});
   const made=page.waitForResponse(r=>r.request().method()==='POST'&&new URL(r.url()).pathname===`/api/admin/applicants/${ana}/viewing-proposals`);
   await form.getByRole('button',{name:'Propose this time'}).click();
   assert.equal((await made).status(),201);
   await page.waitForURL(/#\/viewings\?viewing=\d+$/);
   const detail=page.locator('article.inbox-detail'),coord=detail.locator('section.coord');
   await coord.getByText('Time proposed',{exact:true}).waitFor();
   assert.equal(await detail.getByRole('button',{name:'Confirm',exact:true}).count(),0,'local_slot_not_agency_confirmation');
   const [v]=d1(`SELECT id, status, name, email FROM viewing_requests WHERE listing_id='${agency}'`);
   assert.deepEqual([v.status,v.name,v.email],['requested',name,email],'request_not_booked');
   assert.deepEqual(d1(`SELECT state, required, applicant_id FROM viewing_proposals WHERE viewing_id=${v.id}`),
    [{state:'open',required:'["client","advertiser"]',applicant_id:ana}],'two_searches_exact_target');
   await coord.locator('ul.coord-people > li').filter({hasText:'Advertiser or agency'}).getByText('Waiting for their answer').waitFor();
   await fits('coordination');
   if(shots)await detail.screenshot({path:join(shots,`sap09-proposed-${width}.png`)});
   assert.equal(d1(`SELECT search_state FROM applicants WHERE id=${ana}`)[0].search_state,'active','search_stays_active');

   // Again for the same home: refused, pointing to the viewing already held (M1).
   await page.goto(base+`admin/#/applicants/${ana}/matches`);
   await matchCard(`SAP09 agency ${width}`).getByRole('link',{name:/^Book viewing/}).click();
   await form.getByRole('note').filter({hasText:'Advertised by'}).waitFor();
   await pick(form.locator('.slot-picker'));
   await form.getByRole('button',{name:'Propose this time'}).click();
   await form.getByRole('alert').filter({hasText:'already has an active viewing of this property'}).waitFor();
   assert.equal(await form.getByRole('link',{name:'Open the viewing already held'}).getAttribute('href'),`#/viewings?viewing=${v.id}`);
   assert.equal(d1(`SELECT COUNT(*) n FROM viewing_requests WHERE listing_id='${agency}'`)[0].n,1);

   // The team's own New viewing, without a search, never confirms the agency's home (G2).
   await page.goto(base+'admin/#/viewings');
   await page.getByRole('button',{name:'New viewing'}).click();
   await form.getByLabel('Property').selectOption(agency);
   await pick(form.locator('.slot-picker'));
   await form.getByLabel('Name').fill('Walk In');await form.getByLabel('Email').fill(`walkin-${width}@example.test`);
   await form.getByRole('button',{name:'Book viewing'}).click();
   await form.getByRole('alert').filter({hasText:'Another agency advertises this property'}).waitFor();
   assert.equal(d1(`SELECT COUNT(*) n FROM viewing_requests WHERE listing_id='${agency}'`)[0].n,1);
   await form.getByRole('button',{name:'Close'}).click();

   // A home no longer offered offers no Book viewing (M2).
   d1(`UPDATE listings SET availability='sold' WHERE id='${own}'`);
   await page.goto(base+`admin/#/applicants/${ana}/matches`);
   await matchCard(`SAP09 own ${width}`).waitFor();
   assert.equal(await matchCard(`SAP09 own ${width}`).getByRole('link',{name:/^Book viewing/}).count(),0);
   await page.close();
  }
  assert.deepEqual(errors,[]);
  console.log('SAP09 quick actions e2e passed at 1280 and 390');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
