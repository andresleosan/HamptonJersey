// Execute only after the F artifact/package are approved; never use host profiles.
import fs from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright-core';
import {signSession,COOKIE} from './auth.mjs';
import {validateInput} from './input.mjs';
import {ORIGIN,wireBrowser,liveClient} from './transport.mjs';
import {runApiSmoke} from './cases.mjs';
import {runUiSmoke} from './ui-cases.mjs';

let input,secretFile,secretIdentity,browser,context,anonymousContext;
const report={mode:'published-QA-from-isolated-runner',passed:false,credentials_removed:false,
  screenshots_or_traces:false,production_requests:false,provider_integrations:'simulated'};
try {
  let raw='';for await(const chunk of process.stdin){raw+=chunk.toString('utf8');if(Buffer.byteLength(raw)>8192)throw Error('QA input rejected');}
  input=validateInput(JSON.parse(raw));
  if(process.getuid()!==1000||process.getgid()!==1000)throw Error('QA runtime rejected');
  const st=await fs.stat('/run/qa');
  const mounts=await fs.readFile('/proc/self/mountinfo','utf8');
  if(st.uid!==1000||(st.mode&0o077)!==0||!mounts.split('\n').some(line=>line.split(' ')[4]==='/run/qa'&&line.includes(' - tmpfs ')))throw Error('QA secret storage rejected');
  const candidate='/run/qa/'+input.runId+'.json';
  const handle=await fs.open(candidate,'wx',0o600);
  secretFile=candidate;secretIdentity=await handle.stat();
  try{await handle.writeFile(raw);}finally{await handle.close();}raw='';
  if((secretIdentity.mode&0o077)!==0)throw Error('QA secret storage rejected');
  report.runId=input.runId;report.build_id=input.buildId;
  const proxy={server:'http://172.30.230.2:3128'};
  browser=await chromium.launch({headless:true,chromiumSandbox:true,proxy,
    args:['--disable-quic','--disable-background-networking','--proxy-bypass-list=<-loopback>']});
  const options={proxy,serviceWorkers:'block',acceptDownloads:false,ignoreHTTPSErrors:true};
  context=await browser.newContext(options);anonymousContext=await browser.newContext(options);
  const credentials={accessClientId:input.accessClientId,accessClientSecret:input.accessClientSecret};
  const counters=await wireBrowser(context,{credentials,runId:input.runId});
  await context.addCookies([{name:COOKIE,value:await signSession('qa-agent@example.test',input.sessionSecret),url:ORIGIN+'/',secure:true,httpOnly:true,sameSite:'Strict'}]);
  const client=liveClient(context,anonymousContext,{credentials,runId:input.runId});
  const pattern=await fs.readFile(fileURLToPath(new URL('./qa-pattern-01.png',import.meta.url)));
  report.api=await runApiSmoke(client,{runId:input.runId,buildId:input.buildId,pattern});
  report.ui=await runUiSmoke(context);
  report.network=counters;
  report.passed=Object.values(counters).every(value=>value===0)&&report.api.checks.every(check=>check.passed)&&report.ui.checks.every(check=>check.passed);
}catch(error){
  const name=error?.qaCase;
  report.failure=typeof name==='string'&&/^[A-Za-z0-9_:+./-]{1,240}$/.test(name)?name:'QA-run-failed';
  if(error?.qaReport)report.api=error.qaReport;
}finally{
  await context?.close().catch(()=>{});await anonymousContext?.close().catch(()=>{});await browser?.close().catch(()=>{});
  if(secretFile){try{
    const current=await fs.lstat(secretFile);
    if(current.isSymbolicLink()||current.ino!==secretIdentity.ino||current.dev!==secretIdentity.dev)throw Error('QA ownership changed');
    await fs.unlink(secretFile);report.credentials_removed=true;
  }catch{report.passed=false;}}
  if(input?.runId){
    const path='/results/full-app-'+input.runId+'.json';await fs.writeFile(path,JSON.stringify(report,null,2)+'\n',{mode:0o600});
    input.accessClientId=input.accessClientSecret=input.sessionSecret=undefined;
  }
}
process.stdout.write(JSON.stringify({passed:report.passed,runId:report.runId,api_checks:report.api?.checks?.length,
  ui_checks:report.ui?.checks?.length,credentials_removed:report.credentials_removed})+'\n');
process.exitCode=report.passed?0:1;
