// Isolated local fixtures only: E2E_PRODUCTION_READONLY=0 E2E_SCRIPT=tests/bus07-provenance.e2e.cjs npm run test:e2e:isolated
// BUS-07 / SPR-07: the Listings list shows each listing's source, what was confirmed apart from what was seen on the web,
// and filters by source and by a real price or availability change; a person links a listing to a market home from its
// Adverts card, sees that home's adverts and undoes the link. Real routes and D1, synthetic data.
const assert=require('node:assert/strict');
const {readFileSync,mkdirSync}=require('node:fs');
const {join,dirname}=require('node:path');
const {parseEnv}=require('node:util');
const {createHash,randomUUID}=require('node:crypto');
const {execFileSync}=require('node:child_process');
const {chromium,webkit}=require(process.env.PW||'playwright-core');
(async()=>{
 assert.equal(process.env.HAMPTON_E2E_ISOLATED,'1');assert.equal(process.env.E2E_PRODUCTION_READONLY,'0');
 const vars=parseEnv(readFileSync(process.env.E2E_VARS,'utf8')),{signSession,COOKIE}=await import('../server/auth.js');
 for(const k of ['BUS07_PROVENANCE_READY','BUS10_IDENTITY_READY','EST16_AVAILABILITY_READY','SPR08_SECTIONS_READY'])assert.equal(vars[k],'1',k);
 const base=process.env.BASE.replace('127.0.0.1','localhost'),origin=new URL(base).origin,ADMIN='admin@example.test';
 const shots=process.env.E2E_SHOTS;if(shots)mkdirSync(shots,{recursive:true});
 const wrangler=join(dirname(require.resolve('wrangler')),'..','bin','wrangler.js');
 const d1=sql=>JSON.parse(execFileSync(process.execPath,[wrangler,'d1','execute','hampton','--local','--persist-to',process.env.E2E_PERSIST,
  '--json','--command',sql],{encoding:'utf8',stdio:['ignore','pipe','pipe']})).at(-1).results;
 const value=v=>v==null?'NULL':typeof v==='number'?String(v):`'${String(v).replaceAll("'","''")}'`;
 const insert=(table,row)=>`INSERT INTO ${table}(${Object.keys(row)}) VALUES(${Object.values(row).map(value)});`;
 const browser=await (process.env.HAMPTON_E2E_BROWSER==='webkit'?webkit:chromium).launch({executablePath:process.env.CHROME});
 try{
  const ctx=await browser.newContext();
  await ctx.addCookies([{name:COOKIE,value:await signSession(ADMIN,vars.SESSION_SECRET),domain:new URL(base).hostname,path:'/',httpOnly:true,secure:true,sameSite:'Strict'}]);
  await ctx.route('https://fonts.googleapis.com/**',route=>route.fulfill({status:200,contentType:'text/css',body:''}));
  const api=async(method,path,data,expected)=>{const r=await ctx.request.fetch(base+'api/admin/'+path,{method,headers:{origin},data});
   assert.equal(r.status(),expected,`${method} ${path}: ${await r.text()}`);return r.json();};
  // The market inventory as staff load it (as BUS-10's check does): two agencies reviewed for manual upload, one batch.
  const AGENCIES=['agency-a','agency-b'];
  const manifest=JSON.stringify({schema_version:1,status:'candidate_not_authorized',revision:'bus07-e2e',channels:AGENCIES.map(source_ref=>(
   {source_ref,channel_id:'web',source_kind:'external',source_class:'unclassified',access_status:'pending',coverage_claim:'unknown',
    channel_url_known:true,review_state:'terms_and_method_review',handoff_row:2}))})+'\n';
  await api('POST','market/manifests',{manifest,sha256:createHash('sha256').update(manifest).digest('hex')},201);
  for(const source_ref of AGENCIES)await api('POST','market/sources/review',{source_ref,channel_id:'web',version:1,operation_id:randomUUID(),
   source_class:'general',status:'manual_only',method:'manual',allowed_hosts:[`${source_ref}.example.test`],allowed_paths:['/properties'],
   allowed_redirect_hosts:[],min_interval_s:60,evidence_ref:'fixture-evidence',retention_ref:'fixture-retention',review_due_at:'2999-01-01T00:00:00.000Z'},200);
  const run=(await api('POST','market/runs',{kind:'initial',manifest_revision:'bus07-e2e',operation_id:randomUUID()},201)).run;
  const seen=new Date(Date.now()-5000).toISOString();
  const record=(source_ref,key,amount)=>({external_key:key,source_at:seen,listing_url:`https://${source_ref}.example.test/properties/${key.toLowerCase()}`,
   observation:{country_code:'JE',territory_evidence:'Address on the listing: Synthetic Court, St Helier, Jersey',operation:'rent',observed_at:seen,
    title:`Synthetic Court flat on ${source_ref}`,parish:'St Helier',bedrooms:2,bathrooms:1,
    financial_terms:[{kind:'rent',amount_minor:amount,currency:'GBP',period:'month',raw_text:'pcm'}]}});
  for(const [n,source_ref] of AGENCIES.entries())await api('POST','market/manual-pages',{schema_version:1,run_id:run.id,source_ref,channel_id:'web',
   policy_version:2,page_key:'batch-1',observed_at:seen,records:[1280,390].map(w=>record(source_ref,`BUS07-${w}-${n}`,150000+n*5000))},201);

  const errors=[];
  for(const width of [1280,390]){
   console.log('BUS07 width',width);
   // Per width: Hampton's own flat, sighted by the research and confirmed by its owner, saved once without a price change;
   // and a flat of the agency import, with its imported photo, whose rent went down.
   const own=`HE-B${width}`,agency=`HE-D${width}`,IMPORTED=`E2E Import ${width}`;
   const flat=(id,title,rent)=>insert('listings',{id,title,use:'residential',operation:'rent',availability:'to_let',rent,rent_period:'month',currency:'GBP',
    country:'Jersey',parish:'St Helier',bedrooms:2,published:0,specs:'[]',created_at:'2026-11-01T10:00:00.000Z',updated_at:'2026-11-01T10:00:00.000Z',updated_by:'fixture'});
   d1(flat(own,`BUS07 own ${width}`,1500)+flat(agency,`BUS07 agency ${width}`,2000)
    +insert('research_sources',{source_id:`BUS07-${width}`,property_id:own,accessed_on:'2026-10-05',origin:'External',title:'Advert',agent_or_site:'Example Portal'})
    +insert('media',{id:`BUS07${width}`,listing_id:agency,r2_key:`uploads/bus07-${width}.jpg`,thumb_key:`thumbs/uploads/bus07-${width}.jpg`,origin:'upload',
     kind:'photo',public:1,position:0,content_type:'image/jpeg',provider:IMPORTED,rights_status:'user_declared_permission_2026-10-08',
     created_at:'2026-10-08T10:00:00.000Z',created_by:'import'}));
   await api('POST',`listings/${own}/availability`,{status:'available',confirmed_at:'2026-11-10T09:30:00.000Z',source:'owner',channel:'phone',
    scope:'property',evidence_ref:`Call note ${width}`},201);
   const at=id=>d1(`SELECT updated_at FROM listings WHERE id='${id}'`)[0].updated_at;
   await api('PUT',`listings/${own}`,{updated_at:at(own),title:`BUS07 own ${width} renamed`},200);
   await api('PUT',`listings/${agency}`,{updated_at:at(agency),rent:1900},200);

   const page=await ctx.newPage();page.on('pageerror',e=>errors.push(e.message));
   page.setDefaultTimeout(15000);
   await page.setViewportSize({width,height:900});
   const fits=async where=>assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth+1),`no sideways scroll: ${where} at ${width}`);
   const text=async where=>(await where.innerText()).replace(/\s+/g,' ').trim();
   // Polled to its final text: the list and each card load on their own and reload after every action.
   const says=async(where,label,expected)=>{
    const ok=async()=>{if(await where.count()!==1)return false;const t=await text(where);return expected.every(part=>t.includes(part));};
    for(let i=0;i<80&&!(await ok());i++)await page.waitForTimeout(100);
    assert.ok(await ok(),`${label}: "${await where.count()===1?await text(where):`${await where.count()} elements`}" should include ${JSON.stringify(expected)}`);
   };
   const shown=async(id,expected)=>{
    const ok=async()=>(await page.locator(`tbody tr:has-text("${id}")`).count())===(expected?1:0);
    for(let i=0;i<80&&!(await ok());i++)await page.waitForTimeout(100);
    assert.ok(await ok(),`${id} should ${expected?'':'not '}be listed`);
   };

   // The list: Source, and under Checked the confirmation (EST-16) apart from the web sighting.
   await page.goto(base+'admin/#/listings');
   await page.getByRole('group',{name:'Status'}).getByRole('button',{name:/^All/}).click();
   const row=id=>page.locator(`tbody tr:has-text("${id}")`);
   await says(row(own),'own row',['Hampton','Confirmed 10 Nov 2026 · owner','Seen on the web 5 Oct 2026']);
   await says(row(agency),'agency row',['Co-listed',IMPORTED,'Not confirmed']);
   assert.ok(await page.locator('thead th',{hasText:'Source'}).count()===1);
   assert.equal((await text(row(own))).includes('Call note'),false,'the evidence stays in the listing');
   // Source filter: one agency, then Hampton.
   const source=page.locator('.filters label',{hasText:/^Source/}).locator('select');
   await source.selectOption(`agency:${IMPORTED}`);
   await shown(agency,true);await shown(own,false);
   await source.selectOption('hampton');
   await shown(own,true);await shown(agency,false);
   await source.selectOption('');
   // A real change of rent counts; a renamed title does not.
   const recent=page.getByLabel('Price or availability changed in the last 7 days');
   await recent.check();
   await shown(agency,true);await shown(own,false);
   await recent.uncheck();
   await shown(own,true);
   await fits('listings');
   if(shots)await page.screenshot({path:join(shots,`bus07-list-${width}.png`)});

   // The agency's flat: its source and the photo permission recorded with the import, as recorded.
   await page.goto(base+`admin/#/p/${agency}`);
   const adverts=page.locator('#s-adverts');
   await says(adverts,'agency source',[`Co-listed · ${IMPORTED}`,'from the agency import of 8 Oct 2026','only through Enquiries',
    'user_declared_permission_2026-10-08','1 imported photo','new photos need their own permission']);
   await fits('agency adverts');

   // Hampton's flat: not linked; a person chooses the market advert that is this property, by keyboard.
   await page.goto(base+`admin/#/p/${own}`);
   await says(adverts,'own source',['Source','Hampton','Market home','Not linked','Imported research']);
   const before=d1(`SELECT (SELECT updated_at FROM listings WHERE id='${own}') AS at,(SELECT COUNT(*) FROM availability_confirmations) AS c,
    (SELECT COUNT(*) FROM matches) AS m,(SELECT COUNT(*) FROM events) AS e`);
   await adverts.getByRole('button',{name:'Choose a market advert'}).click();
   const choices=adverts.getByRole('list',{name:'Market adverts to choose from'});
   await choices.waitFor();
   const mine=choices.getByRole('listitem').filter({hasText:`BUS07-${width}-0`});
   await says(mine,'choice',['agency-a','£1,500.00 per month','St Helier']);
   const linked=page.waitForResponse(r=>r.request().method()==='POST'&&new URL(r.url()).pathname===`/api/admin/listings/${own}/market-link`);
   await mine.getByRole('button',{name:/^This property/}).focus();await page.keyboard.press('Enter');
   assert.equal((await linked).status(),201);
   await adverts.getByRole('status').filter({hasText:'Linked to its market home.'}).waitFor();
   await says(adverts,'linked',[`Linked by ${ADMIN}`,`BUS07-${width}-0`,'£1,500.00 per month','Seen on the web is not a confirmation']);
   assert.deepEqual(d1(`SELECT action,actor FROM listing_market_links WHERE listing_id='${own}'`),[{action:'link',actor:ADMIN}]);
   assert.deepEqual(d1(`SELECT (SELECT updated_at FROM listings WHERE id='${own}') AS at,(SELECT COUNT(*) FROM availability_confirmations) AS c,
    (SELECT COUNT(*) FROM matches) AS m,(SELECT COUNT(*) FROM events) AS e`),before,'a link changes no listing, confirmation, match or history');
   await fits('linked');
   if(shots)await adverts.screenshot({path:join(shots,`bus07-linked-${width}.png`)});

   // Undone: the history keeps both rows and the card is back to choosing.
   page.once('dialog',dialog=>dialog.accept());
   await adverts.getByRole('button',{name:'Unlink'}).click();
   await adverts.getByRole('status').filter({hasText:'Unlinked from the market home.'}).waitFor();
   await says(adverts,'unlinked',['Not linked']);
   await adverts.getByRole('button',{name:'Choose a market advert'}).waitFor();
   assert.deepEqual(d1(`SELECT action FROM listing_market_links WHERE listing_id='${own}' ORDER BY created_at,action`),[{action:'link'},{action:'unlink'}]);
   await fits('unlinked');
   await page.close();
  }
  assert.deepEqual(errors,[]);
  console.log('BUS-07 E2E passed: 1280/390, Source column and filter (Hampton, one agency), Confirmed apart from Seen on the web, the 7-day filter on a real rent change and not a renamed title; the import\'s photo permission as recorded; a market advert linked by keyboard with its price and date, changing nothing else, and unlinked with its history kept.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
