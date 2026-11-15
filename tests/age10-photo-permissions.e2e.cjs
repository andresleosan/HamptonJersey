// Isolated local fixtures only: E2E_PRODUCTION_READONLY=0 E2E_SCRIPT=tests/age10-photo-permissions.e2e.cjs npm run test:e2e:isolated
const assert=require('node:assert/strict');
const {readFileSync,mkdirSync}=require('node:fs');
const {join,dirname}=require('node:path');
const {parseEnv}=require('node:util');
const {execFileSync}=require('node:child_process');
const {chromium,webkit}=require(process.env.PW||'playwright-core');
(async()=>{
 assert.equal(process.env.HAMPTON_E2E_ISOLATED,'1');assert.equal(process.env.E2E_PRODUCTION_READONLY,'0');
 const vars=parseEnv(readFileSync(process.env.E2E_VARS,'utf8')),{signSession,COOKIE}=await import('../server/auth.js');
 assert.equal(vars.AGE10_PHOTOS_READY,'1');assert.equal(vars.SPR03_CAPTURE_READY,'1');assert.equal(vars.SPR08_SECTIONS_READY,'1');
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
  for(const width of [1280,390]){
   console.log('AGE10 width',width);
   // A co-listed home: one photo of the agency import (branded), one of the team, and one that is only a link.
   const lid=`HE-G${width}`,stamp='2026-11-09T10:00:00.000Z';
   d1(insert('listings',{id:lid,title:`AGE10 ${width} home`,use:'residential',operation:'sale',availability:'for_sale',sale_price:790000,currency:'GBP',
     country:'Jersey',location:'St Helier',bedrooms:3,bathrooms:2,published:0,specs:'[]',created_at:stamp,updated_at:stamp,updated_by:'fixture'}));
   const upload=async label=>{const up=await ctx.request.post(base+`api/admin/listings/${lid}/media`,{headers:{origin},multipart:{kind:'photo',label,
    file:{name:'photo.jpg',mimeType:'image/jpeg',buffer:photo},thumb:{name:'thumb.jpg',mimeType:'image/jpeg',buffer:thumb}}});
    assert.equal(up.status(),201,await up.text());return (await up.json()).media.id;};
   const front=await upload('Front');await upload('Garden');
   d1(`UPDATE media SET created_by='import',provider='Agency Example',rights_status='user_declared_permission_2026-10-08',public=0 WHERE id='${front}';`
    +insert('media',{id:`M${width}LINK`,listing_id:lid,origin:'external',kind:'photo',label:'Agency link',public:0,position:2,
      source_url:'https://agency.example.test/photo.jpg',created_at:stamp}));
   const media=d1(`SELECT id,public,r2_key FROM media WHERE listing_id='${lid}' ORDER BY id`);
   const avail=await ctx.request.post(base+`api/admin/listings/${lid}/availability`,{headers:{origin},data:{status:'available',
    confirmed_at:'2026-11-10T09:30:00.000Z',source:'owner',channel:'phone',scope:'property',evidence_ref:`Call note AGE10 ${width}`}});
   assert.equal(avail.status(),201,await avail.text());

   const page=await ctx.newPage();page.on('pageerror',e=>errors.push(e.message));
   page.setDefaultTimeout(15000);
   await page.setViewportSize({width,height:900});
   const fits=async where=>assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth+1),`no sideways scroll: ${where} at ${width}`);
   const text=async where=>(await where.innerText()).replace(/\s+/g,' ').trim();
   const says=async(where,label,expected)=>{
    const ok=async()=>{if(await where.count()!==1)return false;const t=await text(where);return expected.every(part=>t.includes(part));};
    for(let i=0;i<80&&!(await ok());i++)await page.waitForTimeout(100);
    assert.ok(await ok(),`${label}: "${await where.count()===1?await text(where):`${await where.count()} elements`}" should include ${JSON.stringify(expected)}`);
   };
   await page.goto(base+`admin/#/p/${lid}`);
   const card=page.locator('#s-photo-permissions');
   await says(card,'to review',['Photos for clients','No captured file is suitable for a client yet','1 captured file is not stored here',
    'Front','To review','Agency import · Agency Example · permission recorded then: user_declared_permission_2026-10-08','Garden','Uploaded by the team']);
   assert.equal(await card.locator('ul > li').count(),2);
   const item=name=>card.locator('ul > li').filter({hasText:name});
   await fits('to review');

   // The agency's photo is branded: it stays internal and a task asks for a version without branding.
   await item('Front').locator('select').selectOption('branded');
   await item('Front').getByRole('button',{name:'Save decision'}).click();
   await card.getByRole('status').filter({hasText:'Decision saved.'}).waitFor();
   await says(item('Front'),'branded',['Branded · internal only',`reviewed by ${ADMIN}`]);
   await says(card,'still none',['No captured file is suitable for a client yet']);
   assert.deepEqual(d1(`SELECT title,resolved_at FROM notifications WHERE task_key='work:capture:listing:${lid}:photos'`),
    [{title:'Get an unbranded version of the photos',resolved_at:null}]);

   // A supplied version needs its evidence; the team's own photo does not. By keyboard.
   await item('Garden').locator('select').selectOption('supplied_unbranded');
   await item('Garden').getByRole('button',{name:'Save decision'}).click();
   await says(item('Garden'),'needs evidence',['Say who supplied or authorised this version, and how']);
   await item('Garden').locator('select').selectOption('own');
   await item('Garden').getByRole('button',{name:'Save decision'}).focus();
   await page.keyboard.press('Enter');
   await says(card,'one suitable',['1 of 2 captured files are suitable for a private presentation.']);
   await says(item('Garden'),'own',['Suitable for clients',"Hampton's own photo"]);
   await says(item('Front'),'original kept',['Branded · internal only']);
   assert.notEqual(d1(`SELECT resolved_at FROM notifications WHERE task_key='work:capture:listing:${lid}:photos'`)[0].resolved_at,null);
   await fits('reviewed');
   if(shots)await card.screenshot({path:join(shots,`age10-photos-${width}.png`)});

   // Nothing was made public or changed; a decision on an old version is refused.
   assert.deepEqual(d1(`SELECT id,public,r2_key FROM media WHERE listing_id='${lid}' ORDER BY id`),media);
   const garden=d1(`SELECT asset_id FROM image_permissions WHERE listing_id='${lid}' AND status='private_approved'`)[0].asset_id;
   const stale=await ctx.request.post(base+'api/admin/photo-permissions',{headers:{origin},data:{asset_id:garden,version:0,status:'denied'}});
   assert.equal(stale.status(),409,await stale.text());
   assert.equal(d1(`SELECT COUNT(*) AS n FROM image_permissions WHERE listing_id='${lid}'`)[0].n,2);
   const history=await ctx.request.get(base+`api/admin/listings/${lid}/history`);
   assert.equal((await history.json()).items.filter(i=>i.type==='listing.photo_reviewed').length,2);
   await page.close();
  }
  assert.deepEqual(errors,[]);
  console.log('AGE10 photo permissions e2e passed');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
