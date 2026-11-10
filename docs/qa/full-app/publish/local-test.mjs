// Fully local dispatch: no QA credentials or requests to the published origin.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';
import {randomBytes,randomUUID} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {ORIGIN,qaUrl} from './runner/transport.mjs';
import {runApiSmoke} from './runner/cases.mjs';
import {runUiSmoke} from './runner/ui-cases.mjs';

const root=fileURLToPath(new URL('../../../../',import.meta.url));
const source=path.join(root,'build/qa-full-app-F/source');
const artifact=path.join(root,'build/qa-full-app-F/artifact');
const require=createRequire(path.join(source,'package.json'));
const {Miniflare,convertV4MiniflareOptions,Log,LogLevel}=require('miniflare');
const {chromium}=require(path.join(root,'test-results/qa-agent-runtime/runner-package/node_modules/playwright-core'));
const manifest=JSON.parse(fs.readFileSync(path.join(root,'build/qa-full-app-F/build-manifest.json')));
const fixture=JSON.parse(fs.readFileSync(path.join(root,'docs/qa/full-app/manifest.json')));
const scratch=fs.mkdtempSync(path.join(os.tmpdir(),'hampton-F-local-'));
const persist=path.join(scratch,'state');
const runId='run-'+randomUUID();
const env=Object.fromEntries(Object.entries(process.env).filter(([k])=>['PATH','SYSTEMROOT','WINDIR','TEMP','TMP','COMSPEC','PATHEXT','APPDATA','LOCALAPPDATA'].includes(k.toUpperCase())));
Object.assign(env,{CI:'true',WRANGLER_SEND_METRICS:'false',WRANGLER_LOG_SANITIZE:'true'});
function importLocal(file){
  const args=[path.join(source,'node_modules/wrangler/bin/wrangler.js'),'d1','execute','DB','--config',path.join(source,'wrangler.toml'),'--local','--persist-to',persist,'--file',file,'--json'];
  const q=spawnSync(process.execPath,args,{cwd:source,env,encoding:'utf8'});
  if(q.status!==0)throw Error('Local SQL fixture import failed');
}
let mf,browser;
const report={mode:'local-Miniflare-virtual-origin',static_service:'fixed artifact-file ASSETS fixture; native Miniflare alpha asset router is separately unverified',source_sha:manifest.source_sha,build_id:manifest.build_id,
  artifact_sha256:manifest.artifact_sha256,real_QA_credentials_read:false,published_requests:0,runId,passed:false};
try {
  importLocal(path.join(root,'docs/qa/full-app/setup.sql'));
  importLocal(path.join(root,'docs/qa/full-app/publish/prerequisite.sql'));
  const localSecret=randomBytes(32).toString('hex');
  const options=await convertV4MiniflareOptions({host:'127.0.0.1',port:0,modules:true,modulesRoot:artifact,
    scriptPath:path.join(artifact,'_worker.js'),name:'hampton-qa-local-F',compatibilityDate:'2025-10-01',
    bindings:{SESSION_SECRET:localSecret},d1Databases:{DB:'53bc4af9-7250-44fe-8f90-6e415fda1034'},
    r2Buckets:{MEDIA:'hampton-app-qa-media'},resourcePersistencePath:path.join(persist,'v3'),
    serviceBindings:{ASSETS:async request=>{
      const url=new URL(request.url);let name=decodeURIComponent(url.pathname).replace(/^\//,'');
      if(!name||name.endsWith('/'))name+='index.html';
      if(name.startsWith('.')||name.startsWith('_')||name.split('/').includes('..')||!manifest.files.some(x=>x.file===name))return new Response('Not found',{status:404});
      const file=path.join(artifact,name),extension=path.extname(file);
      const types={'.html':'text/html; charset=utf-8','.js':'application/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.png':'image/png','.txt':'text/plain; charset=utf-8'};
      return new Response(request.method==='HEAD'?null:fs.readFileSync(file),{headers:{'content-type':types[extension]||'application/octet-stream'}});
    }},
    outboundService:()=>{throw Error('Local outbound blocked');},log:new Log(LogLevel.NONE)});
  mf=new Miniflare(options);await mf.ready;
  try {
    const guard=await (await mf.getD1Database('DB')).prepare('SELECT marker,database_id,fixture_version FROM qa_app_guard WHERE id=1').first();
    report.local_guard_matches=guard?.marker==='hampton-app-qa-v1'&&guard?.database_id==='53bc4af9-7250-44fe-8f90-6e415fda1034'&&guard?.fixture_version===1;
  }catch{report.local_guard_matches=false;}
  const bucket=await mf.getR2Bucket('MEDIA');
  for(const item of fixture.media_objects)await bucket.put(item.r2_key,fs.readFileSync(path.join(root,'docs/qa/full-app',item.file)),{httpMetadata:{contentType:item.content_type}});
  const {signSession,COOKIE}=await import(pathToFileURL(path.join(source,'server/auth.js')).href);
  const cookie=await signSession('qa-agent@example.test',localSecret);
  const client={async request(relative,options={}){
    const url=qaUrl(relative);const headers=new Headers({'x-qa-run':runId,'connection':'close'});
    if(!options.anonymous)headers.set('cookie',COOKIE+'='+cookie);
    if(options.csrf!==false)headers.set('origin',ORIGIN);
    let body;
    if(options.json!==undefined){headers.set('content-type','application/json');body=JSON.stringify(options.json);}
    if(options.multipart){
      const boundary='qa-local-'+randomUUID(),parts=[];
      for(const [key,value] of Object.entries(options.multipart)){
        if(!/^[a-z_]+$/.test(key))throw Error('Local multipart field rejected');
        const file=value?.buffer;
        parts.push(Buffer.from('--'+boundary+'\r\nContent-Disposition: form-data; name="'+key+'"'+
          (file?'; filename="'+value.name+'"\r\nContent-Type: '+value.mimeType:'')+'\r\n\r\n'));
        parts.push(file?Buffer.from(value.buffer):Buffer.from(String(value)),Buffer.from('\r\n'));
      }
      parts.push(Buffer.from('--'+boundary+'--\r\n'));body=Buffer.concat(parts);
      headers.set('content-type','multipart/form-data; boundary='+boundary);
    }
    let response;
    try{response=await mf.dispatchFetch(url.href,{method:options.method||'GET',headers,body});}
    catch(error){
      report.dispatch_error={path:url.pathname,type:error?.name,code:error?.code,
        cause_type:error?.cause?.name,cause_code:error?.cause?.code,cause_keys:Object.keys(error?.cause||{}),
        frames:String(error?.stack||'').split('\n').slice(1,4),
        category:/csrf|origin/i.test(String(error?.message))?'origin':/undefined|null/i.test(String(error?.message))?'undefined':/headers/i.test(String(error?.message))?'headers':'other'};
      throw error;
    }
    (report.dispatch_statuses??=[]).push({path:url.pathname,method:options.method||'GET',status:response.status});
    const bytes=Buffer.from(await response.arrayBuffer());let data;
    if((response.headers.get('content-type')||'').includes('application/json'))data=JSON.parse(bytes.toString());
    return {status:response.status,body:bytes,data,headers:Object.fromEntries(response.headers)};
  }};
  console.log('LOCAL_ARTIFACT_READY; PUBLISHED_REQUESTS=0');
  report.api=await runApiSmoke(client,{runId,buildId:manifest.build_id,pattern:fs.readFileSync(path.join(root,'docs/qa/full-app/media/qa-pattern-01.png'))});
  console.log('LOCAL_API_SMOKE_FINISHED');
  const executable=['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Google/Chrome/Application/chrome.exe'].find(fs.existsSync);
  if(!executable)throw Error('Local blank-profile Chrome is unavailable');
  browser=await chromium.launch({executablePath:executable,headless:true,proxy:{server:'http://127.0.0.1:9',bypass:'<-loopback>'},
    args:['--disable-quic','--disable-background-networking','--disable-component-update']});
  const context=await browser.newContext({serviceWorkers:'block',acceptDownloads:false});
  await context.addCookies([{name:COOKIE,value:cookie,url:ORIGIN+'/',httpOnly:true,secure:true,sameSite:'Strict'}]);
  let offOrigin=0;
  await context.route('**/*',async route=>{
    try {
      const request=route.request(),url=new URL(request.url());
      if(url.origin!==ORIGIN){offOrigin++;await route.abort('blockedbyclient');return;}
      const headers=new Headers(request.headers());
      const cookies=await context.cookies(url.href);
      if(cookies.length)headers.set('cookie',cookies.map(c=>c.name+'='+c.value).join('; '));
      const response=await mf.dispatchFetch(url.href,{method:request.method(),headers,body:request.postDataBuffer()||undefined});
      await route.fulfill({status:response.status,headers:Object.fromEntries(response.headers),body:Buffer.from(await response.arrayBuffer())});
    }catch{await route.abort('failed').catch(()=>{});}
  });
  report.ui=await runUiSmoke(context);
  report.off_origin_attempts=offOrigin;
  report.passed=offOrigin===0&&report.api.checks.every(c=>c.passed)&&report.ui.checks.every(c=>c.passed);
  await context.close();
}catch(error){
  const safeCase=/^QA_CASE_FAILED:([A-Za-z0-9_:+./-]+)$/.exec(String(error?.message));
  report.failure=typeof error?.caseId==='string'?error.caseId:safeCase?safeCase[1]:'local-validation-failed';
  report.error_type=error?.constructor?.name||'Error';
  if(!safeCase)report.debug_frames=String(error?.stack||'').split('\n').slice(1,4).map(line=>line.replace(/.*\((.*):(\d+):(\d+)\)/,'$1:$2:$3'));
}
finally{
  if(browser)await browser.close().catch(()=>{});
  if(mf)await mf.dispose().catch(()=>{});
  const destination=path.join(root,'test-results/qa-F-local-results.json');
  fs.writeFileSync(destination,JSON.stringify(report,null,2)+'\n');
  // This path was freshly returned by mkdtemp, never supplied by the caller.
  if(path.dirname(scratch)===os.tmpdir()&&path.basename(scratch).startsWith('hampton-F-local-'))fs.rmSync(scratch,{recursive:true,force:true});
}
console.log(JSON.stringify({mode:report.mode,passed:report.passed,failure:report.failure,
  api_checks:report.api?.checks?.length,ui_checks:report.ui?.checks?.length,local_guard_matches:report.local_guard_matches,first_dispatches:report.dispatch_statuses?.slice(0,3),
  failed_ui:report.ui?.checks?.filter(c=>!c.passed).map(c=>({case:c.case,failure:c.failure,layout:c.layout})),published_requests:0}));
process.exitCode=report.passed?0:1;
