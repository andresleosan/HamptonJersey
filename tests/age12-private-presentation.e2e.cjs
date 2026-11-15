// Isolated local fixtures only: E2E_PRODUCTION_READONLY=0 E2E_SCRIPT=tests/age12-private-presentation.e2e.cjs npm run test:e2e:isolated
// AGE-12: the team creates a private link to a client's confirmed home, copies it and records sending it; the client
// opens it without signing in, sees only AGE-10's suitable photo and answers once; a revocation closes it.
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
 assert.equal(vars.AGE12_PRESENTATIONS_READY,'1');assert.equal(vars.AGE10_PHOTOS_READY,'1');assert.equal(vars.SPR03_CAPTURE_READY,'1');
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
   console.log('AGE12 width',width);
   const lid=`HE-K${width}`,title=`AGE12 ${width} home`,stamp='2026-11-09T10:00:00.000Z';
   d1('UPDATE listings SET matchable=0;'+insert('listings',{id:lid,title,use:'residential',operation:'sale',availability:'for_sale',matchable:1,
    sale_price:900000,currency:'GBP',country:'Jersey',location:'St Helier',bedrooms:3,bathrooms:2,published:0,specs:'[]',created_at:stamp,
    updated_at:stamp,updated_by:'fixture',...extractFeatures({description:'Parking for two cars'}),parish:'St Helier'}));
   const post=async(path,data,expected=200,method='post')=>{const r=await ctx.request[method](base+'api'+path,{headers:{origin},data});
    assert.equal(r.status(),expected,await r.text());return r.json();};
   const upload=async label=>{const up=await ctx.request.post(base+`api/admin/listings/${lid}/media`,{headers:{origin},multipart:{kind:'photo',label,
    file:{name:'photo.jpg',mimeType:'image/jpeg',buffer:photo},thumb:{name:'thumb.jpg',mimeType:'image/jpeg',buffer:thumb}}});
    assert.equal(up.status(),201,await up.text());return (await up.json()).media.id;};
   const front=await upload('Front'),branded=await upload('Agency board');
   await post(`/admin/listings/${lid}/availability`,{status:'available',confirmed_at:'2026-11-10T09:30:00.000Z',source:'owner',channel:'phone',
    scope:'property',evidence_ref:`Call note AGE12 ${width}`},201);
   const asset=m=>d1(`SELECT id FROM property_capture_assets WHERE media_id='${m}' ORDER BY id DESC`)[0].id;
   await post('/admin/photo-permissions',{asset_id:asset(front),version:0,status:'private_approved',basis:'own'});
   await post('/admin/photo-permissions',{asset_id:asset(branded),version:0,status:'branded'});
   const ana=(await post('/admin/applicants',{name:`AGE12 Ana ${width}`,email:`age12-ana-${width}@example.test`,operation:'buy',source:'phone',
    budget_max:1000000,parking_spaces:2,pets:[{kind:'none'}],household_adults:2,household_children:1,
    requirement_priorities:{version:1,values:{budget:'must',parking:'must'},unknown:[]}},201)).id;
   const match=d1(`SELECT id FROM matches WHERE applicant_id=${ana} AND listing_id='${lid}'`)[0].id;
   await post(`/admin/matches/${match}`,{status:'shortlisted',from:'found'},200,'put');
   const before={search:d1(`SELECT * FROM applicants WHERE id=${ana}`),viewings:d1('SELECT COUNT(*) AS n FROM viewing_requests')[0].n};

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
   await fits(page,'panel');
   // The team picks the home (by keyboard) and creates the link: shown once, dormant until they record sending it.
   await card.getByRole('checkbox',{name:`${lid} · ${title}`}).focus();await page.keyboard.press('Space');
   await card.getByRole('button',{name:'Create private link'}).click();
   const box=card.getByLabel('New private link · shown only now');await box.waitFor();
   const link=await box.inputValue();
   assert.match(link,/\/presentation#[A-Za-z0-9_-]{43}$/);
   await says(card,'dormant',['Not sent yet','The link does not work until you record sending it.',`${lid} · ${title}: no answer yet`]);
   assert.equal(JSON.stringify(d1('SELECT * FROM presentation_grants')).includes(new URL(link).hash.slice(1)),false);
   if(shots)await card.screenshot({path:join(shots,`age12-panel-${width}.png`)});

   // The client, signed out, in another browser profile.
   const guest=await browser.newContext({viewport:{width,height:900}}),client=await guest.newPage();
   client.on('pageerror',e=>errors.push(e.message));client.setDefaultTimeout(15000);
   client.on('request',r=>{if(new URL(r.url()).origin!==origin)thirdParty.push(r.url());});
   await client.goto(link);
   await says(client.locator('main'),'dormant link',['This link is not available. Please contact Hampton Estates.']);
   assert.equal(new URL(client.url()).hash,''); // the token left the address bar
   await card.getByRole('button',{name:'I have sent it'}).click();
   await says(card,'sent',['Working',`Sent by ${ADMIN}`]);
   await page.reload(); // the matches' counts are read when the record opens
   await page.locator('.seg').getByRole('button',{name:/Waiting for client/}).waitFor();
   await says(page.locator('.seg').getByRole('button',{name:/Waiting for client/}),'waiting for client',['Waiting for client 1']);

   await client.goto('about:blank');
   const res=await client.goto(link);
   assert.equal(res.headers()['cache-control'],'no-store');assert.equal(res.headers()['x-robots-tag'],'noindex');
   assert.equal(res.headers()['referrer-policy'],'no-referrer');
   const home=client.locator('li.home');
   await says(home,'client view',[title,'St Helier · 3 bedrooms · 2 bathrooms','£900,000',"I'm interested","I'd like to view it",'Not for me',
    'Please call me','Anything to add?']);
   assert.equal(new URL(client.url()).hash,'');
   // Only the suitable photo, loaded through the private route; never the branded one or the public /media.
   const imgs=home.locator('.photos img');
   assert.equal(await imgs.count(),1);assert.equal(await imgs.getAttribute('alt'),'Front');
   for(let i=0;i<50&&!(await imgs.evaluate(i=>i.complete&&i.naturalWidth>0));i++)await client.waitForTimeout(100);
   assert.ok(await imgs.evaluate(i=>i.naturalWidth>0),'the suitable photo loads');
   assert.match(await imgs.getAttribute('src'),/^\/api\/presentation\/photos\/\d+$/);
   assert.deepEqual(await client.evaluate(()=>[localStorage.length,sessionStorage.length]),[0,0]);
   await fits(client,'client');
   if(shots)await client.screenshot({path:join(shots,`age12-client-${width}.png`),fullPage:true});

   // An answer needs a choice; then one explicit POST, and a viewing request books nothing.
   await home.getByRole('button',{name:'Send answer'}).click();
   await says(home.getByRole('alert'),'choice needed',['Choose an answer first.']);
   await home.getByText("I'd like to view it").click();
   await home.getByRole('button',{name:'Send answer'}).click();
   await says(home.getByRole('status'),'answered',['We will arrange a viewing with the times you already gave us']);
   assert.deepEqual(d1(`SELECT choice FROM presentation_options WHERE match_id=${match}`),[{choice:'request_viewing'}]);
   assert.deepEqual(d1(`SELECT title FROM notifications WHERE task_key LIKE 'presentation:%' AND target_id='${ana}'`),[{title:`Arrange a viewing of ${lid} for the client`}]);
   assert.deepEqual(d1(`SELECT status FROM matches WHERE id=${match}`),[{status:'shortlisted'}]);
   assert.deepEqual(d1(`SELECT * FROM applicants WHERE id=${ana}`),before.search);
   assert.equal(d1('SELECT COUNT(*) AS n FROM viewing_requests')[0].n,before.viewings);
   await client.reload();
   await says(home,'kept',["You answered: I'd like to view it."]);
   assert.equal(await home.getByRole('button',{name:'Send answer'}).count(),0);
   if(shots)await client.screenshot({path:join(shots,`age12-answered-${width}.png`),fullPage:true});
   // Archived since: nothing of the home is shown, not even its photo.
   d1(`UPDATE listings SET archived_at='2026-11-14T10:00:00.000Z' WHERE id='${lid}';`);
   await client.reload();
   await says(home,'archived',['This home is no longer available.']);
   assert.equal((await text(home)).includes(title),false);assert.equal(await home.locator('img').count(),0);
   d1(`UPDATE listings SET archived_at=NULL WHERE id='${lid}';`);

   // The team sees the answer, then revokes the link: the client's next read is refused.
   await page.reload();
   await says(card,'answer in the panel',[`${lid} · ${title}: Would like to view it`]);
   await card.getByRole('button',{name:'Revoke link'}).click();
   await says(card,'revoked',['Revoked',`Revoked by ${ADMIN}`]);
   await client.reload();
   await says(client.locator('main'),'revoked',['This link is not available. Please contact Hampton Estates.']);
   await client.goto('about:blank');await client.goto(link);
   await says(client.locator('main'),'link revoked',['This link is not available. Please contact Hampton Estates.']);
   await fits(client,'revoked');
   await guest.close();await page.close();
  }
  assert.deepEqual(errors,[]);
  assert.deepEqual(thirdParty,[]);
  console.log('AGE12 private presentation e2e passed');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
