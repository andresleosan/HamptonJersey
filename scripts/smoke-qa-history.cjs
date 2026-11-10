// Read-only QA smoke: synthetic History in the published panel, plus non-disclosing DB check.
// Never points existing destructive E2E scripts at production.
const {readFileSync,lstatSync,realpathSync,mkdtempSync,mkdirSync,writeFileSync,rmSync}=require('node:fs');
const assert=require('node:assert/strict');
const {tmpdir}=require('node:os');
const {join,sep}=require('node:path');
const {forwardQa}=require('./qa-browser-auth.cjs');

const PROD='https://www.hamptonestatesjersey.com';
const LOCAL_KEY='local-fixture-qa-key-not-for-production-012345';
function privateFile(file){
  if(!file)throw Error('Private QA credential file required outside the repository');
  const actual=realpathSync(file),repo=realpathSync(join(__dirname,'..'));
  if(actual===repo||actual.startsWith(repo+sep))throw Error('QA credential file cannot be in the repository');
  const stat=lstatSync(file);
  if(!stat.isFile()||stat.isSymbolicLink()||(stat.mode&0o077)||stat.uid!==process.getuid())
    throw Error('QA credential file must be owned by this user and private (0600)');
  return readFileSync(file,'utf8').trim();
}
function settings(){
  const local=process.env.QA_LOCAL==='1',origin=local?process.env.BASE:PROD;
  const url=new URL(origin);
  if(local?!['127.0.0.1','localhost'].includes(url.hostname)||url.protocol!=='http:':url.origin!==PROD||url.href!==PROD+'/')
    throw Error('QA origin not allowed');
  const key=privateFile(process.env.QA_HISTORY_KEY_FILE);
  if(!/^[A-Za-z0-9_-]{32,128}$/.test(key))throw Error('QA key format invalid');
  if(local&&key!==LOCAL_KEY)
    throw Error('Local QA requires the synthetic fixture identity');
  if(!local&&key===LOCAL_KEY)throw Error('Production QA cannot use the fixture identity');
  let access={};
  if(!local){
    const id=privateFile(process.env.QA_ACCESS_CLIENT_ID_FILE);
    const secret=privateFile(process.env.QA_ACCESS_CLIENT_SECRET_FILE);
    if(!/^[\x21-\x7e]{8,256}$/.test(id)||!/^[\x21-\x7e]{32,512}$/.test(secret))
      throw Error('QA Access identity format invalid');
    access={'cf-access-client-id':id,'cf-access-client-secret':secret};
  }
  return {origin:url.origin,key,local,access};
}

async function run(){
  const {origin,key,local,access}=settings();
  const {chromium,request}=require(process.env.PW||'playwright-core');
  const client=await request.newContext({baseURL:origin});
  try{
    const health=await client.get('/api/qa/production-check',{
      headers:{...access,authorization:`Bearer ${key}`},maxRedirects:0,timeout:15000});
    assert.equal(health.status(),200,'production read-only check unavailable');
    const result=await health.json().catch(()=>null);
    if(!result||Object.keys(result).length!==1||result.ok!==true)
      throw Error('production read-only response invalid');
  }finally{await client.dispose();}
  const browser=await chromium.launch({executablePath:process.env.CHROME,headless:true});
  try{
    for(const width of [1280,390]){
      const context=await browser.newContext({viewport:{width,height:900},reducedMotion:'reduce',serviceWorkers:'block'});
      let authorised=true;
      const attempts=[];
      await context.route('**/api/qa/**',route=>forwardQa(route,{origin,key,authorised,access}));
      try{
        const page=await context.newPage();
        page.on('request',r=>{if(/\/api\/(admin|me)(\/|\?|$)/.test(new URL(r.url()).pathname))attempts.push(r.url());});
        const response=await page.goto(origin+'/admin/#/qa-history',{waitUntil:'networkidle',timeout:25000});
        assert.equal(response.status(),200);
        const history=page.getByRole('region',{name:'History',exact:true});
        await history.getByText('50 recorded events shown.').waitFor({timeout:15000});
        const text=await page.locator('body').innerText();
        assert.ok(text.includes('Fictional property only.'));
        assert.ok(text.includes('Sale milestone updated')&&text.includes('Viewing requested'));
        assert.ok(!/Synthetic visitor|Synthetic person|nobody@example|visitor@example|PRIVATE/.test(text));
        assert.equal(attempts.length,0,'QA page loaded business routes');
        await history.getByRole('button',{name:'Refresh history'}).click();
        await history.getByText('50 recorded events shown.').waitFor({timeout:15000});
        await history.getByRole('button',{name:'Load older events'}).click();
        await history.getByText('60 recorded events shown.').waitFor({timeout:15000});
        const wide=await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth+1);
        assert.equal(wide,false,'horizontal overflow');
        if(local){
          authorised=false;
          await history.getByRole('button',{name:'Refresh history'}).click();
          await history.getByRole('alert').waitFor({timeout:15000});
          assert.equal(await history.locator('ol>li').count(),0,'revoked QA rows must disappear');
        }
      }finally{await context.close();}
    }
  }finally{await browser.close();}
  if(local&&process.env.QA_NATIVE_ZOOM==='1'){
    for(const width of [1280,390]){
      const profile=mkdtempSync(join(tmpdir(),'hampton-qa-zoom-'));
      let context;
      try{
        mkdirSync(join(profile,'Default'));
        writeFileSync(join(profile,'Default','Preferences'),JSON.stringify({partition:{default_zoom_level:
          {x:3.8017840169239308}}}),{mode:0o600});
        context=await chromium.launchPersistentContext(profile,{executablePath:process.env.CHROME,
          headless:false,viewport:{width,height:900},serviceWorkers:'block',reducedMotion:'reduce'});
        await context.route('**/api/qa/**',route=>forwardQa(route,{origin,key,authorised:true}));
        const page=await context.newPage();
        await page.goto(origin+'/admin/#/qa-history',{waitUntil:'networkidle',timeout:25000});
        const history=page.getByRole('region',{name:'History',exact:true});
        await history.getByText('50 recorded events shown.').waitFor({timeout:15000});
        const refresh=history.getByRole('button',{name:'Refresh history'});
        await refresh.focus();
        const m=await page.evaluate(()=>{
          const box=document.activeElement.getBoundingClientRect();
          return {dpr:devicePixelRatio,width:innerWidth,scroll:document.documentElement.scrollWidth,
            focusLeft:box.left,focusRight:box.right};
        });
        assert.ok(Math.abs(m.dpr-2)<0.15&&Math.abs(m.width-width/2)<5,
          'native 200% zoom metrics not confirmed');
        assert.ok(m.scroll<=m.width+1&&m.focusLeft>=0&&m.focusRight<=m.width+1,
          'overflow or focus outside native zoom viewport');
        console.log('QA_NATIVE_ZOOM_OK',width,'effective',m.width,'dpr',m.dpr);
      }finally{if(context)await context.close();rmSync(profile,{recursive:true,force:true});}
    }
  }
  console.log('SMOKE_QA_OK: production-check, panel 1280/390, refresh, pagination, privacy');
}
run().catch(e=>{
  console.error('SMOKE_QA_FAILED:',process.env.QA_LOCAL==='1'?e.message:'QA verification failed');
  process.exitCode=1;
});
