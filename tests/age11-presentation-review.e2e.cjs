// Isolated local fixtures only: E2E_PRODUCTION_READONLY=0 E2E_SCRIPT=tests/age11-presentation-review.e2e.cjs npm run test:e2e:isolated
// AGE-11: before sending AGE-12's private link, a person reviews the exact snapshot (home, confirmation date, price,
// suitable photo) and approves it; "I have sent it" waits for that approval, a change after it needs approving again,
// and the client's page shows only the approved snapshot.
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
 assert.equal(vars.AGE11_REVIEW_READY,'1');assert.equal(vars.AGE12_PRESENTATIONS_READY,'1');assert.equal(vars.AGE10_PHOTOS_READY,'1');
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
  const errors=[],thirdParty=[];
  for(const width of [1280,390]){
   console.log('AGE11 width',width);
   const lid=`HE-J${width}`,title=`AGE11 ${width} home`,stamp='2026-11-09T10:00:00.000Z';
   d1('UPDATE listings SET matchable=0;'+insert('listings',{id:lid,title,use:'residential',operation:'sale',availability:'for_sale',matchable:1,
    sale_price:900000,currency:'GBP',country:'Jersey',location:'St Helier',bedrooms:3,bathrooms:2,published:0,specs:'[]',created_at:stamp,
    updated_at:stamp,updated_by:'fixture',summary:'Bright family home',...extractFeatures({description:'Parking for two cars'}),parish:'St Helier'}));
   const post=async(path,data,expected=200,method='post')=>{const r=await ctx.request[method](base+'api'+path,{headers:{origin},data});
    assert.equal(r.status(),expected,await r.text());return r.json();};
   const upload=async label=>{const up=await ctx.request.post(base+`api/admin/listings/${lid}/media`,{headers:{origin},multipart:{kind:'photo',label,
    file:{name:'photo.jpg',mimeType:'image/jpeg',buffer:photo},thumb:{name:'thumb.jpg',mimeType:'image/jpeg',buffer:thumb}}});
    assert.equal(up.status(),201,await up.text());return (await up.json()).media.id;};
   const front=await upload('Front'),branded=await upload('Agency board');
   await post(`/admin/listings/${lid}/availability`,{status:'available',confirmed_at:'2026-11-10T09:30:00.000Z',source:'owner',channel:'phone',
    scope:'property',evidence_ref:`Call note AGE11 ${width}`},201);
   const asset=m=>d1(`SELECT id FROM property_capture_assets WHERE media_id='${m}' ORDER BY id DESC`)[0].id;
   await post('/admin/photo-permissions',{asset_id:asset(front),version:0,status:'private_approved',basis:'own'});
   await post('/admin/photo-permissions',{asset_id:asset(branded),version:0,status:'branded'});
   const ana=(await post('/admin/applicants',{name:`AGE11 Ana ${width}`,email:`age11-ana-${width}@example.test`,operation:'buy',source:'phone',
    budget_max:1000000,parking_spaces:2,pets:[{kind:'none'}],household_adults:2,household_children:1,
    requirement_priorities:{version:1,values:{budget:'must',parking:'must'},unknown:[]}},201)).id;
   const match=d1(`SELECT id FROM matches WHERE applicant_id=${ana} AND listing_id='${lid}'`)[0].id;
   await post(`/admin/matches/${match}`,{status:'shortlisted',from:'found'},200,'put');

   const page=await ctx.newPage();page.on('pageerror',e=>errors.push(e.message));
   page.setDefaultTimeout(15000);
   await page.setViewportSize({width,height:900});
   const text=async where=>(await where.innerText()).replace(/\s+/g,' ').trim();
   const says=async(where,label,expected)=>{
    const ok=async()=>{if(await where.count()!==1)return false;const t=await text(where);return expected.every(part=>t.includes(part));};
    for(let i=0;i<80&&!(await ok());i++)await where.page().waitForTimeout(100);
    assert.ok(await ok(),`${label}: "${await where.count()===1?await text(where):`${await where.count()} elements`}" should include ${JSON.stringify(expected)}`);
   };
   const fits=async(p,where)=>assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth+1),`no sideways scroll: ${where} at ${width}`);
   await page.goto(base+`admin/#/applicants/${ana}/matches`);
   const card=page.locator('#s-presentations');
   await says(card,'presentable',['Private presentation',`${lid} · ${title}`]);
   await card.getByRole('checkbox',{name:`${lid} · ${title}`}).check();
   await card.getByRole('button',{name:'Create private link'}).click();
   const box=card.getByLabel('New private link · shown only now');await box.waitFor();
   const link=await box.inputValue();
   // Not reviewed: no "I have sent it" yet.
   await says(card,'not reviewed',['Not sent yet','Not reviewed yet: review and approve the presentation before you send the link.']);
   assert.equal(await card.getByRole('button',{name:'I have sent it'}).count(),0);

   // The review shows what the client will see; the person approves it by keyboard.
   await card.getByRole('button',{name:'Review before sending'}).click();
   const review=card.getByRole('group',{name:/^Review of link/});
   await says(review,'review',[title,lid,'St Helier · 3 bedrooms · 2 bathrooms','£900,000','Availability confirmed on 10 November 2026',
    'Bright family home']);
   assert.equal(await review.locator('img.thumb').count(),1);assert.equal(await review.locator('img.thumb').getAttribute('alt'),'Front');
   await fits(page,'review');
   if(shots)await card.screenshot({path:join(shots,`age11-review-${width}.png`)});
   await review.getByRole('button',{name:'Approve this presentation'}).focus();await page.keyboard.press('Enter');
   await says(review,'approved',['Approved','as it stands, by '+ADMIN]);
   await says(card,'approved in the list',['Presentation approved by '+ADMIN,'(version 1)']);
   const reviews=()=>d1(`SELECT r.version, r.approved_by FROM presentation_reviews r JOIN presentation_grants g ON g.id=r.grant_id WHERE g.applicant_id=${ana}`);
   assert.deepEqual(reviews(),[{version:1,approved_by:ADMIN}]);

   // A change after the approval: "I have sent it" is refused until approved again.
   d1(`UPDATE listings SET summary='Bright family home, new kitchen' WHERE id='${lid}';`);
   await card.getByRole('button',{name:'I have sent it'}).click();
   await says(card.getByRole('alert'),'stale',['This presentation changed since it was approved']);
   assert.deepEqual(d1(`SELECT sent_at FROM presentation_grants WHERE applicant_id=${ana}`),[{sent_at:null}]);
   await page.reload();
   await card.getByRole('button',{name:'Review before sending'}).click();
   await says(review,'stale review',['Bright family home, new kitchen','Changed since it was approved (version 1)']);
   await review.getByRole('button',{name:'Approve this presentation'}).click();
   await says(card,'approved again',['(version 2)']);
   await card.getByRole('button',{name:'I have sent it'}).click();
   await says(card,'sent',['Working',`Sent by ${ADMIN}`]);
   // ANA-06's receipt: the client confirms receiving it in a conversation the team logs; a person records it with the real time.
   await page.waitForTimeout(1100);
   const contact=d1(`SELECT contact_id FROM applicants WHERE id=${ana}`)[0].contact_id;
   await post(`/admin/contacts/${contact}/conversation`,undefined);
   const talk=d1(`SELECT id, at FROM events WHERE type='contact.conversation' AND entity_id='${contact}' ORDER BY id DESC`)[0];
   await page.reload();
   await says(card,'no receipt',['Receipt not confirmed yet.']);
   await card.getByRole('button',{name:'Client confirmed receipt'}).click();
   const form=card.getByRole('form',{name:`Receipt of ${lid}`});
   await form.getByRole('button',{name:'Save receipt'}).click();
   await says(card.getByRole('alert'),'time needed',['Enter when the client received it']);
   const local=await page.evaluate(at=>{const d=new Date(at),p=n=>String(n).padStart(2,'0');
    return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;},talk.at);
   await form.getByLabel('When the client received it').fill(local);
   await form.getByLabel('Logged conversation in which they confirmed it').selectOption(String(talk.id));
   await form.getByRole('button',{name:'Save receipt'}).click();
   await says(card,'receipt',['Client confirmed receipt: received',`recorded by ${ADMIN}`]);
   const receipts=()=>d1(`SELECT p.revision, p.status, p.evidence_event_id FROM presentation_receipts p JOIN presentation_grants g ON g.id=p.grant_id
    WHERE g.applicant_id=${ana} ORDER BY p.revision`);
   assert.deepEqual(receipts(),[{revision:1,status:'verified',evidence_event_id:talk.id}]);
   await fits(page,'panel');
   if(shots)await card.screenshot({path:join(shots,`age11-panel-${width}.png`)});
   // Revoked with a reason: a new revision, the earlier one kept.
   await card.getByRole('button',{name:'Revoke receipt'}).click();
   await form.getByLabel('Reason').fill('Recorded on the wrong home');
   await form.getByRole('button',{name:'Revoke receipt'}).click();
   await says(card,'receipt revoked',['Receipt revoked.']);
   assert.deepEqual(receipts().map(r=>r.status),['verified','revoked']);

   // The client: only the approved snapshot, even after a later change of title.
   d1(`UPDATE listings SET title='Renamed after sending' WHERE id='${lid}';`);
   const guest=await browser.newContext({viewport:{width,height:900}}),client=await guest.newPage();
   client.on('pageerror',e=>errors.push(e.message));client.setDefaultTimeout(15000);
   client.on('request',r=>{if(new URL(r.url()).origin!==origin)thirdParty.push(r.url());});
   await client.goto(link);
   const home=client.locator('li.home');
   await says(home,'client view',[title,'£900,000','Availability confirmed on 10 November 2026','Bright family home, new kitchen',"I'm interested"]);
   assert.equal((await text(home)).includes('Renamed after sending'),false);
   const imgs=home.locator('.photos img');
   assert.equal(await imgs.count(),1);assert.equal(await imgs.getAttribute('alt'),'Front');
   for(let i=0;i<50&&!(await imgs.evaluate(i=>i.complete&&i.naturalWidth>0));i++)await client.waitForTimeout(100);
   assert.ok(await imgs.evaluate(i=>i.naturalWidth>0),'the approved photo loads');
   await fits(client,'client');
   if(shots)await client.screenshot({path:join(shots,`age11-client-${width}.png`),fullPage:true});
   // No longer confirmed available: the home is not shown as confirmed, nor at all.
   await post(`/admin/listings/${lid}/availability`,{status:'unknown',confirmed_at:'2026-11-11T09:30:00.000Z',source:'owner',channel:'phone',
    scope:'property',evidence_ref:`Call note AGE11 ${width} b`},201);
   await client.reload();
   await says(home,'not confirmed',['This home is no longer available.']);
   assert.equal((await text(home)).includes('Availability confirmed'),false);
   await guest.close();await page.close();
  }
  assert.deepEqual(errors,[]);
  assert.deepEqual(thirdParty,[]);
  console.log('AGE11 presentation review e2e passed');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
