// Isolated local fixtures only: E2E_PRODUCTION_READONLY=0 E2E_SCRIPT=tests/spr03-capture.e2e.cjs npm run test:e2e:isolated
const assert=require('node:assert/strict');
const {readFileSync,mkdirSync}=require('node:fs');
const {join,dirname}=require('node:path');
const {parseEnv}=require('node:util');
const {execFileSync}=require('node:child_process');
const {chromium,webkit}=require(process.env.PW||'playwright-core');
(async()=>{
 assert.equal(process.env.HAMPTON_E2E_ISOLATED,'1');assert.equal(process.env.E2E_PRODUCTION_READONLY,'0');
 const vars=parseEnv(readFileSync(process.env.E2E_VARS,'utf8')),{signSession,COOKIE}=await import('../server/auth.js');
 assert.equal(vars.SPR03_CAPTURE_READY,'1');assert.equal(vars.EST16_AVAILABILITY_READY,'1');assert.equal(vars.SPR08_SECTIONS_READY,'1');
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
  const ctx=await browser.newContext({acceptDownloads:true});
  await ctx.addCookies([{name:COOKIE,value:await signSession(ADMIN,vars.SESSION_SECRET),domain:new URL(base).hostname,path:'/',httpOnly:true,secure:true,sameSite:'Strict'}]);
  await ctx.route('https://fonts.googleapis.com/**',route=>route.fulfill({status:200,contentType:'text/css',body:''}));
  const errors=[];
  for(const width of [1280,390]){
   console.log('SPR03 width',width);
   // A home with one photo uploaded by the team, one whose file is gone from storage and one that is only a link.
   const lid=`HE-C${width}`,stamp='2026-11-09T10:00:00.000Z';
   d1(insert('listings',{id:lid,title:`SPR03 ${width} home`,use:'residential',operation:'sale',availability:'for_sale',sale_price:790000,currency:'GBP',
     country:'Jersey',location:'St Helier',bedrooms:3,bathrooms:2,published:0,specs:'[]',created_at:stamp,updated_at:stamp,updated_by:'fixture'}));
   const up=await ctx.request.post(base+`api/admin/listings/${lid}/media`,{headers:{origin},multipart:{kind:'photo',label:'Kitchen',
    file:{name:'kitchen.jpg',mimeType:'image/jpeg',buffer:photo},thumb:{name:'thumb.jpg',mimeType:'image/jpeg',buffer:thumb}}});
   assert.equal(up.status(),201,await up.text());
   d1(insert('media',{id:`M${width}GONE`,listing_id:lid,r2_key:`uploads/spr03-missing-${width}.jpg`,origin:'upload',kind:'photo',label:'Garden',
      public:0,position:1,content_type:'image/jpeg',created_at:stamp})
    +insert('media',{id:`M${width}LINK`,listing_id:lid,origin:'external',kind:'photo',label:'Agency photo',public:0,position:2,
      source_url:'https://agency.example.test/photo.jpg',created_at:stamp}));

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
   const card=page.locator('#s-capture');
   await says(card,'before',['Captured record','Nothing captured yet']);

   // The owner confirms it is available, in the editor's own card: one shared record is captured.
   const avail=await ctx.request.post(base+`api/admin/listings/${lid}/availability`,{headers:{origin},data:{status:'available',
    confirmed_at:'2026-11-10T09:30:00.000Z',source:'owner',channel:'phone',scope:'property',evidence_ref:`Call note SPR03 ${width}`}});
   assert.equal(avail.status(),201,await avail.text());
   await page.reload();
   await says(card,'captured',['Partial','1 of 3 files stored','Call note SPR03','Data to complete','Summary',
    'Kitchen','Stored','Garden','Not found','The file was not found in storage.','Agency photo','Link only','Not complete: 2 of 3 files are not stored']);
   const files=card.locator('ul[aria-labelledby="h-capture-files"] > li');
   assert.equal(await files.count(),3);
   assert.equal(await files.nth(2).getByRole('link',{name:'Open source'}).getAttribute('href'),'https://agency.example.test/photo.jpg');
   assert.deepEqual(d1(`SELECT state FROM property_captures WHERE listing_id='${lid}'`),[{state:'partial'}]);
   assert.deepEqual(d1(`SELECT title,resolved_at FROM notifications WHERE target_id='${lid}' AND task_key LIKE 'work:capture:%'`),
    [{title:'Open property record: capture partial (1 of 3 files)',resolved_at:null}]);
   await fits('captured record');
   if(shots)await card.screenshot({path:join(shots,`spr03-capture-${width}.png`)});

   // The stored photo downloads as an attachment; the ZIP says it is incomplete.
   const [one]=await Promise.all([page.waitForEvent('download'),files.nth(0).getByRole('link',{name:'Download'}).click()]);
   assert.match(one.suggestedFilename(),new RegExp(`^${lid}-capture-\\d+-1\\.jpg$`));
   await files.nth(0).getByRole('checkbox',{name:'Select Kitchen'}).check();
   const zipLink=card.getByRole('link',{name:'Download 1 selected (ZIP)'});
   const zip=await ctx.request.get(new URL(await zipLink.getAttribute('href'),page.url()).href);
   assert.equal(zip.status(),200);assert.equal(zip.headers()['x-capture-complete'],'0');
   assert.match(zip.headers()['content-disposition'],/photos-incomplete\.zip"$/);
   const csv=await ctx.request.get(new URL(await card.getByRole('link',{name:'Data (CSV)'}).getAttribute('href'),page.url()).href);
   assert.match(await csv.text(),/\r\ncomplete,no\r\n/);

   // Checking again by keyboard: the missing file is still missing, and the result is announced.
   await card.getByRole('button',{name:'Check files again'}).focus();
   await page.keyboard.press('Enter');
   await card.getByRole('status').filter({hasText:'Files checked again.'}).waitFor();
   await says(card,'checked again',['Partial','1 of 3 files stored']);
   assert.equal(d1(`SELECT COUNT(*) AS n FROM property_captures WHERE listing_id='${lid}'`)[0].n,1);
   await fits('checked again');
   // The property's history names the capture.
   const history=await ctx.request.get(base+`api/admin/listings/${lid}/history`);
   assert.ok((await history.json()).items.some(i=>i.type==='listing.captured'));
   await page.close();
  }
  assert.deepEqual(errors,[]);
  console.log('SPR03 capture e2e passed');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
