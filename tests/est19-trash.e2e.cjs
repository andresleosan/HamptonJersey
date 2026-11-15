// Isolated local fixtures only: E2E_PRODUCTION_READONLY=0 E2E_SCRIPT=tests/est19-trash.e2e.cjs npm run test:e2e:isolated
// EST-19: the Listings page's Not available section shows what the six-month purge would delete and when, a person
// deletes the due photos (and only those), and restoring a property is a new confirmation that it is available.
const assert=require('node:assert/strict');
const {readFileSync,mkdirSync}=require('node:fs');
const {join,dirname}=require('node:path');
const {parseEnv}=require('node:util');
const {execFileSync}=require('node:child_process');
const {chromium,webkit}=require(process.env.PW||'playwright-core');
(async()=>{
 assert.equal(process.env.HAMPTON_E2E_ISOLATED,'1');assert.equal(process.env.E2E_PRODUCTION_READONLY,'0');
 const vars=parseEnv(readFileSync(process.env.E2E_VARS,'utf8')),{signSession,COOKIE}=await import('../server/auth.js');
 for(const k of ['EST16_AVAILABILITY_READY','EST15_UNAVAILABILITY_READY','EST19_TRASH_READY','EST19_PURGE_READY'])assert.equal(vars[k],'1',k);
 const base=process.env.BASE.replace('127.0.0.1','localhost'),ADMIN='admin@example.test';
 const shots=process.env.E2E_SHOTS;if(shots)mkdirSync(shots,{recursive:true});
 const wrangler=join(dirname(require.resolve('wrangler')),'..','bin','wrangler.js');
 const d1=sql=>JSON.parse(execFileSync(process.execPath,[wrangler,'d1','execute','hampton','--local','--persist-to',process.env.E2E_PERSIST,
  '--json','--command',sql],{encoding:'utf8',stdio:['ignore','pipe','pipe']})).at(-1).results;
 const browser=await (process.env.HAMPTON_E2E_BROWSER==='webkit'?webkit:chromium).launch({executablePath:process.env.CHROME});
 try{
  const ctx=await browser.newContext();
  await ctx.addCookies([{name:COOKIE,value:await signSession(ADMIN,vars.SESSION_SECRET),domain:new URL(base).hostname,path:'/',httpOnly:true,secure:true,sameSite:'Strict'}]);
  await ctx.route('https://fonts.googleapis.com/**',route=>route.fulfill({status:200,contentType:'text/css',body:''}));
  const errors=[];
  for(const width of [1280,390]){
   console.log('EST19 width',width);
   // An old one with two external reference photos, a floor plan and Hampton's own photo; a recent one not yet due.
   const old=`HE-T${width}`,recent=`HE-U${width}`,T='2026-01-01T10:00:00.000Z';
   const listing=(id,title)=>`INSERT INTO listings(id,title,use,operation,availability,country,currency,published,specs,created_at,updated_at,updated_by)
    VALUES('${id}','${title}','residential','sale','for_sale','Jersey','GBP',0,'[]','${T}','${T}','fixture');`;
   const media=(id,lid,origin,kind)=>`INSERT INTO media(id,listing_id,r2_key,thumb_key,origin,kind,public,position,created_at)
    VALUES('${id}','${lid}','e2e/${id}.jpg','thumbs/e2e/${id}.jpg','${origin}','${kind}',0,0,'${T}');`;
   const confirm=(lid,at)=>`INSERT INTO availability_confirmations(listing_id,status,confirmed_at,source,channel,evidence_ref,recorded_at,recorded_by,reason)
    VALUES('${lid}','unavailable','${at}','agency','phone','Call note FIXTURE','${at}','${ADMIN}','sold');`;
   d1(listing(old,`EST19 old ${width}`)+listing(recent,`EST19 recent ${width}`)+media(`E1W${width}`,old,'external','photo')+
    media(`E2W${width}`,old,'external','photo')+media(`FPW${width}`,old,'external','floorplan')+media(`OWW${width}`,old,'hampton','photo')+
    media(`R1W${width}`,recent,'external','photo')+confirm(old,'2026-01-10T10:00:00.000Z')+confirm(recent,'2026-11-01T10:00:00.000Z'));
   const page=await ctx.newPage();page.on('pageerror',e=>errors.push(e.message));
   page.on('dialog',d=>d.accept());
   page.setDefaultTimeout(15000);
   await page.setViewportSize({width,height:900});
   const fits=async where=>assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth+1),`no sideways scroll: ${where} at ${width}`);
   const text=async where=>(await where.innerText()).replace(/\s+/g,' ').trim();
   await page.goto(base+'admin/#/listings');
   const trash=page.getByRole('region',{name:/^Not available/});
   await trash.waitFor();
   const item=title=>trash.locator('ul.confirmations > li').filter({has:page.getByRole('link',{name:title,exact:true})});
   await item(`EST19 old ${width}`).waitFor();
   const oldText=await text(item(`EST19 old ${width}`)),recentText=await text(item(`EST19 recent ${width}`));
   assert.ok(oldText.includes('Not available since')&&oldText.includes('Sold')&&oldText.includes('2 photos due for deletion.')&&oldText.includes('2 files kept.'),oldText);
   assert.ok(recentText.includes('1 photo to delete from')&&recentText.includes('2027'),recentText);
   await fits('trash');
   if(shots)await trash.screenshot({path:join(shots,`est19-trash-${width}.png`)});

   // Deleting: only the two due external photos go; the floor plan, Hampton's photo and the recent one stay.
   const del=trash.getByRole('button',{name:'Delete 2 due photos'});
   const pending=page.waitForResponse(r=>r.request().method()==='POST'&&new URL(r.url()).pathname==='/api/admin/trash/purge');
   await del.click();
   assert.equal((await pending).status(),200);
   await trash.getByRole('status').filter({hasText:'2 photos deleted.'}).waitFor();
   assert.deepEqual(d1(`SELECT id FROM media WHERE listing_id IN ('${old}','${recent}') ORDER BY id`).map(r=>r.id).sort(),
    [`FPW${width}`,`OWW${width}`,`R1W${width}`].sort());
   const ev=d1(`SELECT entity_id,data FROM events WHERE type='listing.photos_purged' AND entity_id='${old}'`);
   assert.equal(ev.length,1);assert.deepEqual(JSON.parse(ev[0].data).media_ids,[`E1W${width}`,`E2W${width}`]);
   assert.ok((await text(item(`EST19 old ${width}`))).includes('No photo to delete.'));
   assert.equal(await trash.getByRole('button',{name:/^Delete/}).count(),0);
   await fits('trash, purged');
   if(shots)await trash.screenshot({path:join(shots,`est19-purged-${width}.png`)});

   // Restoring: a new confirmation that it is available takes it out of the trash.
   await item(`EST19 recent ${width}`).getByRole('button',{name:'Restore…'}).click();
   const form=item(`EST19 recent ${width}`).locator('#s-availability');
   await form.getByLabel('What was confirmed').selectOption('available');
   await form.getByLabel('Who confirmed it').selectOption('owner');
   await form.getByLabel('How it was confirmed').selectOption('phone');
   await form.getByLabel('Evidence reference').fill('Call note FIXTURE');
   const saved=page.waitForResponse(r=>r.request().method()==='POST'&&new URL(r.url()).pathname===`/api/admin/listings/${recent}/availability`);
   await form.getByRole('button',{name:'Record confirmation'}).click();
   assert.equal((await saved).status(),201);
   await fits('trash, restoring');
   if(shots)await item(`EST19 recent ${width}`).screenshot({path:join(shots,`est19-restore-${width}.png`)});
   await item(`EST19 recent ${width}`).getByRole('button',{name:'Close'}).click();
   await item(`EST19 recent ${width}`).waitFor({state:'detached'});
   assert.deepEqual(d1(`SELECT COUNT(*) AS n FROM media WHERE id='R1W${width}'`),[{n:1}]);
   await page.close();
  }
  assert.deepEqual(errors,[]);
  console.log('EST-19 E2E passed: 1280/390, the trash shows when each property entered it, why, and what the purge would delete and when; one click deleted only the due external photos and recorded them; the floor plan, Hampton\'s own photo and the not-yet-due photo stayed; a new available confirmation restored a property.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
